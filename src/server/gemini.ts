import { appendFileSync } from "fs";
import path from "path";
import { dataDir, DeskError, publicError, readFreeGeminiKey, readPaidGeminiKey } from "./paths";
import type { Topic } from "./store";

const TEXT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const IMAGE_MODELS = ["gemini-2.5-flash-image", "gemini-3.1-flash-image", "gemini-nano-banana-2.1"];
const TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"];
export const TTS_VOICES = ["Kore", "Puck", "Charon", "Aoede", "Fenrir", "Leda", "Orus", "Zephyr"] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

function logLine(message: string) {
  appendFileSync(path.join(dataDir(), "app.log"), `${new Date().toISOString()} ${publicError(message)}\n`);
}

function tryNext(error: DeskError) {
  const code = error.status;
  const msg = error.message.toLowerCase();
  if (code === 404 || msg.includes("no longer available") || msg.includes("not found") || msg.includes("not supported")) return true;
  if (code === 429 || msg.includes("resource_exhausted") || msg.includes("rate")) return false;
  if (msg.includes("safety") || msg.includes("blocked") || msg.includes("policy")) return false;
  return code >= 500 || code === 0 || code === 400;
}

async function post(url: string, key: string, body: unknown, label = "writing service", timeoutMs = 120000) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const aborted = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    if (aborted) throw new DeskError(`The ${label} took too long. Try again.`, 502);
    throw new DeskError(`The ${label} could not be reached. ${error instanceof Error ? error.message : ""}`, 502);
  }
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!payload) throw new DeskError(`The ${label} returned an unreadable answer.`, response.status || 502);
  if (!response.ok || payload.error) {
    throw new DeskError(publicError(String(payload.error?.message || `The ${label} refused the request.`)), response.status || 502);
  }
  return payload as Record<string, unknown>;
}

function collectText(payload: Record<string, unknown>) {
  const chunks: string[] = [];
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = (candidate as { content?: { parts?: { text?: string }[] } }).content?.parts || [];
    for (const part of parts) if (typeof part.text === "string") chunks.push(part.text);
  }
  return chunks.join("\n").trim();
}

function decodeJson(text: string): Record<string, unknown> {
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }
  return {};
}

function findImage(payload: unknown): { data: string; mime: string } | null {
  let found: { data: string; mime: string } | null = null;
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== "object") return;
    const row = node as { mimeType?: string; mime_type?: string; data?: string };
    const mime = String(row.mimeType || row.mime_type || "");
    if (typeof row.data === "string" && row.data.length > 200 && mime.startsWith("image/")) {
      found = { data: row.data, mime };
      return;
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(payload);
  return found;
}

function findAudio(payload: unknown): { data: string; mime: string } | null {
  let found: { data: string; mime: string } | null = null;
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== "object") return;
    const row = node as { mimeType?: string; mime_type?: string; data?: string };
    const mime = String(row.mimeType || row.mime_type || "");
    if (typeof row.data === "string" && row.data.length > 200 && (mime.startsWith("audio/") || mime.includes("pcm") || mime.includes("L16"))) {
      found = { data: row.data, mime: mime || "audio/L16" };
      return;
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(payload);
  return found;
}

function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function audioBytes(raw: Buffer, mime: string) {
  const kind = mime.toLowerCase();
  if (kind.includes("wav")) return { bytes: raw, mime: "audio/wav" };
  if (kind.includes("mpeg") || kind.includes("mp3")) return { bytes: raw, mime: "audio/mpeg" };
  if (kind.includes("ogg")) return { bytes: raw, mime: "audio/ogg" };
  // Gemini TTS typically returns raw PCM (s16le, 24 kHz, mono).
  return { bytes: pcmToWav(raw), mime: "audio/wav" };
}

function shapeHint(ratio: string) {
  const shapes: Record<string, string> = {
    "1:1": "square (1:1)",
    "4:5": "portrait (4:5)",
    "9:16": "tall vertical story (9:16)",
    "16:9": "wide landscape (16:9)",
    "4:3": "landscape (4:3)",
    "3:2": "landscape (3:2)",
  };
  return shapes[ratio] || "square (1:1)";
}

const IMAGE_PROMPT_MARKERS = [
  /(?:^|\n)\s*here\s+is\s+the\s+image\s+prompt\s*:\s*/i,
  /(?:^|\n)\s*here'?s\s+the\s+image\s+prompt\s*:\s*/i,
  /(?:^|\n)\s*image\s+prompt\s*:\s*/i,
  /(?:^|\n)\s*picture\s+prompt\s*:\s*/i,
  /(?:^|\n)\s*visual\s+prompt\s*:\s*/i,
];

/** Split description into story text + optional user-supplied image prompt. */
export function splitPostBrief(about: string): { story: string; imagePrompt: string } {
  const raw = String(about || "").trim();
  if (!raw) return { story: "", imagePrompt: "" };
  for (const marker of IMAGE_PROMPT_MARKERS) {
    const match = raw.match(marker);
    if (!match || match.index == null) continue;
    const story = raw.slice(0, match.index).trim();
    const imagePrompt = raw.slice(match.index + match[0].length).trim();
    if (imagePrompt.length >= 24) {
      return { story: story || raw.slice(0, Math.min(280, raw.length)), imagePrompt };
    }
  }
  return { story: raw, imagePrompt: "" };
}

function promptAllowsText(imagePrompt: string) {
  return /\b(text|title|typography|lettering|letters?|words?|logo|brand title|font|sans-serif|typeface|headline|caption on (?:the )?(?:image|picture)|write (?:the )?(?:words?|title))\b/i.test(
    imagePrompt,
  );
}

export async function writePost(key: string, topic: Topic, pageVoice: string) {
  const voice = pageVoice.trim();
  const ratio = topic.ratio || "1:1";
  const shape = shapeHint(ratio);
  const brief = splitPostBrief(topic.about);
  const story = brief.story || topic.about;
  const givenImagePrompt = brief.imagePrompt;
  const prompt = givenImagePrompt
    ? `You write a Facebook caption for a page.

Title: ${topic.title}
What the post is about: ${story}
Language for the caption: ${topic.language}
Tone: ${topic.tone}
${voice ? `How this page should sound: ${voice}\n` : ""}
Return only JSON with this shape:
{"caption":"..."}

caption: the Facebook post in ${topic.language}. Open with the point, then 2 to 4 short paragraphs a person would actually post. Close with 4 to 8 relevant hashtags. Do not mention that you are an AI. Do not use markdown. Do not invent an image prompt.`
    : `You write posts for a Facebook page.

Title: ${topic.title}
What the post is about: ${story}
Language for the caption: ${topic.language}
Tone: ${topic.tone}
${voice ? `How this page should sound: ${voice}\n` : ""}
Return only JSON with this shape:
{"caption":"...","image_prompt":"..."}

caption: the Facebook post in ${topic.language}. Open with the point, then 2 to 4 short paragraphs a person would actually post. Close with 4 to 8 relevant hashtags. Do not mention that you are an AI. Do not use markdown.
image_prompt: one English description of a ${shape} picture that supports the post. Picture style: ${topic.style}. Follow the description closely: keep the same subjects, setting, mood, composition, and any on-image text the description asks for. If the description does not ask for words on the picture, keep the picture free of words, letters, numbers, logos, watermarks, or interface.`;

  let last = "The caption could not be written.";
  for (const model of TEXT_MODELS) {
    try {
      const payload = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, key, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
      });
      const text = collectText(payload);
      if (!text) throw new DeskError("The writing service returned an empty caption.");
      const parsed = decodeJson(text);
      const caption = String(parsed.caption || "").trim();
      const imagePrompt = givenImagePrompt || String(parsed.image_prompt || "").trim();
      if (caption.length < 8 || imagePrompt.length < 8) throw new DeskError("The writing service returned a post that could not be used. Try again.");
      return { caption, image_prompt: imagePrompt };
    } catch (error) {
      const desk = error instanceof DeskError ? error : new DeskError(last, 502);
      last = desk.message;
      if (!tryNext(desk)) break;
      logLine(`Text model ${model} skipped: ${last}`);
    }
  }
  throw new DeskError(last, 502);
}

const IMAGE_RATIOS = new Set(["1:1", "4:5", "9:16", "16:9", "4:3", "3:2"]);
const IMAGE_QUALITIES = new Set(["1K", "2K", "4K"]);

export async function rewriteCaption(key: string, topic: Topic, pageVoice: string, note: string) {
  const voice = pageVoice.trim();
  const guidance = note.trim();
  const story = splitPostBrief(topic.about).story || topic.about;
  const prompt = `You rewrite a Facebook caption for a page.

Title: ${topic.title}
What the post is about: ${story}
Language for the caption: ${topic.language}
Tone: ${topic.tone}
${voice ? `How this page should sound: ${voice}\n` : ""}
Current caption:
${topic.caption || "(none yet)"}
${guidance ? `Change request from the user:\n${guidance}\n` : "Write a fresh caption in the same language and tone.\n"}
Return only JSON: {"caption":"..."}
caption: the Facebook post in ${topic.language}. Open with the point, then 2 to 4 short paragraphs a person would actually post. Close with 4 to 8 relevant hashtags. Do not mention that you are an AI. Do not use markdown.`;

  let last = "The caption could not be rewritten.";
  for (const model of TEXT_MODELS) {
    try {
      const payload = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, key, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, responseMimeType: "application/json" },
      });
      const text = collectText(payload);
      if (!text) throw new DeskError("The writing service returned an empty caption.");
      const caption = String(decodeJson(text).caption || "").trim();
      if (caption.length < 8) throw new DeskError("The writing service returned a caption that could not be used. Try again.");
      return caption;
    } catch (error) {
      const desk = error instanceof DeskError ? error : new DeskError(last, 502);
      last = desk.message;
      if (!tryNext(desk)) break;
      logLine(`Caption rewrite model ${model} skipped: ${last}`);
    }
  }
  throw new DeskError(last, 502);
}

export async function rewriteImagePrompt(key: string, topic: Topic, note: string) {
  const ratio = topic.ratio || "1:1";
  const shape = shapeHint(ratio);
  const guidance = note.trim();
  const brief = splitPostBrief(topic.about);
  if (!guidance && brief.imagePrompt) return brief.imagePrompt;
  const prompt = `You write one English image prompt for a Facebook post picture.

Title: ${topic.title}
What the post is about: ${brief.story || topic.about}
${brief.imagePrompt ? `User-supplied image prompt (preserve this unless the change request overrides it):\n${brief.imagePrompt}\n` : ""}
Caption:
${topic.caption || brief.story || topic.about}
Picture style: ${topic.style}
Current image prompt:
${topic.image_prompt || "(none yet)"}
${guidance ? `Change request from the user:\n${guidance}\n` : "Create a fresh picture description that still fits the post.\n"}
Return only JSON: {"image_prompt":"..."}
image_prompt: one English description of a ${shape} picture. Keep the user's subjects, composition, style, and any requested on-image text. Only drop on-image text when the user did not ask for words on the picture.`;

  let last = "The picture idea could not be rewritten.";
  for (const model of TEXT_MODELS) {
    try {
      const payload = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, key, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, responseMimeType: "application/json" },
      });
      const text = collectText(payload);
      if (!text) throw new DeskError("The writing service returned an empty picture idea.");
      const imagePrompt = String(decodeJson(text).image_prompt || "").trim();
      if (imagePrompt.length < 8) throw new DeskError("The writing service returned a picture idea that could not be used. Try again.");
      return imagePrompt;
    } catch (error) {
      const desk = error instanceof DeskError ? error : new DeskError(last, 502);
      last = desk.message;
      if (!tryNext(desk)) break;
      logLine(`Image rewrite model ${model} skipped: ${last}`);
    }
  }
  throw new DeskError(last, 502);
}

export async function makeImage(
  key: string,
  imagePrompt: string,
  style: string,
  ratio = "1:1",
  quality = "1K",
) {
  const aspectRatio = IMAGE_RATIOS.has(ratio) ? ratio : "1:1";
  const imageSize = IMAGE_QUALITIES.has(quality) ? quality : "1K";
  const allowText = promptAllowsText(imagePrompt);
  const prompt = allowText
    ? `${imagePrompt}\n\nPicture style: ${style}.\n${shapeHint(aspectRatio)} composition. Follow the prompt closely, including any requested titles or typography.`
    : `${imagePrompt}\n\nPicture style: ${style}.\n${shapeHint(aspectRatio)} composition. No text, letters, numbers, logos, watermarks, or borders.`;
  let last = "The picture could not be created.";
  for (const model of IMAGE_MODELS) {
    try {
      const imageConfig: Record<string, string> = { aspectRatio };
      if (model !== "gemini-2.5-flash-image") imageConfig.imageSize = imageSize;
      const payload = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, key, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig },
      });
      const image = findImage(payload);
      if (!image) throw new DeskError("The writing service returned no picture.", 502);
      const bytes = Buffer.from(image.data, "base64");
      if (bytes.length < 1000) throw new DeskError("The writing service returned an empty picture.", 502);
      return { bytes, mime: image.mime };
    } catch (error) {
      const desk = error instanceof DeskError ? error : new DeskError(last, 502);
      last = desk.message;
      if (!tryNext(desk)) break;
      logLine(`Image model ${model} skipped: ${last}`);
    }
  }
  throw new DeskError(last, 502);
}

function findVideo(payload: unknown): string | null {
  let found = "";
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== "object") return;
    const row = node as { type?: string; mimeType?: string; mime_type?: string; data?: string };
    const mime = String(row.mimeType || row.mime_type || "");
    if (typeof row.data === "string" && row.data.length > 1000 && (row.type === "video" || mime.startsWith("video/"))) {
      found = row.data;
      return;
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(payload);
  return found;
}

export const VIDEO_RESOLUTIONS = ["360p", "720p", "1080p", "4k"] as const;
export const VIDEO_RATIOS = ["16:9", "9:16"] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];
export type VideoRatio = (typeof VIDEO_RATIOS)[number];

export async function makeSpeech(textInput: string, voiceInput = "Kore", styleInput = "") {
  const text = String(textInput || "").replace(/\s+/gu, " ").trim();
  if (text.length < 2) throw new DeskError("Add text to speak.");
  if (text.length > 4000) throw new DeskError("Keep the text under 4,000 characters.");
  const voice = (TTS_VOICES as readonly string[]).includes(voiceInput) ? voiceInput : "Kore";
  const style = String(styleInput || "").replace(/\s+/gu, " ").trim().slice(0, 240);
  const spoken = style
    ? `Speak in this style: ${style}\n\nRead this aloud clearly, without adding extra words:\n${text}`
    : `Read this aloud clearly, without adding extra words:\n${text}`;
  const key = readPaidGeminiKey() || readFreeGeminiKey();
  if (!key) throw new DeskError("Speech is not available right now.");

  let last = "The audio could not be created.";
  for (const model of TTS_MODELS) {
    try {
      const payload = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        key,
        {
          contents: [{ role: "user", parts: [{ text: spoken }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
        },
        "speech service",
        120000,
      );
      const audio = findAudio(payload);
      if (!audio) throw new DeskError("The speech service returned no audio.", 502);
      const raw = Buffer.from(audio.data, "base64");
      if (raw.length < 500) throw new DeskError("The speech service returned empty audio.", 502);
      return audioBytes(raw, audio.mime);
    } catch (error) {
      const desk = error instanceof DeskError ? error : new DeskError(last, 502);
      last = desk.message;
      if (!tryNext(desk)) break;
      logLine(`TTS model ${model} skipped: ${last}`);
    }
  }
  throw new DeskError(last, 502);
}

export async function makeSimilarVideo(video: Buffer, changes: string, aspect: VideoRatio, duration: string, resolution: VideoResolution) {
  const key = readFreeGeminiKey();
  if (!key) throw new DeskError("The video service is not configured.", 503);
  const prompt = `Create a new video based on the uploaded clip.
Keep the same subject, place, and action unless the change asks otherwise.
Change to apply: ${changes}
Output shape: ${aspect}. Output resolution: ${resolution}.
No captions, logos, or watermarks.`;
  const payload = await post(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    key,
    {
      model: "gemini-omni-1.2-flash",
      input: [
        { type: "video", data: video.toString("base64"), mime_type: "video/mp4" },
        { type: "text", text: prompt },
      ],
      response_format: { type: "video", duration, resolution, aspect_ratio: aspect },
    },
    "video service",
    240000
  );
  const data = findVideo(payload);
  if (!data) throw new DeskError("The video service did not return a video.", 502);
  const bytes = Buffer.from(data, "base64");
  if (bytes.length < 1000 || !bytes.subarray(0, 32).includes(Buffer.from("ftyp"))) {
    throw new DeskError("The video service returned a file that could not be played.", 502);
  }
  return bytes;
}

