import { createHash } from "crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { dataDir, DeskError, publicError, readEnvGeminiKey } from "./paths";
import type { Topic } from "./store";

const TEXT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const ANSWER_MODELS = ["gemini-flash-lite-latest", ...TEXT_MODELS];
const IMAGE_MODELS = ["gemini-2.5-flash-image", "gemini-3.1-flash-image", "gemini-nano-banana-2.1"];

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

export async function writePost(key: string, topic: Topic, pageVoice: string) {
  const voice = pageVoice.trim();
  const prompt = `You write posts for a Facebook page.

Title: ${topic.title}
What the post is about: ${topic.about}
Language for the caption: ${topic.language}
Tone: ${topic.tone}
${voice ? `How this page should sound: ${voice}\n` : ""}
Return only JSON with this shape:
{"caption":"...","image_prompt":"..."}

caption: the Facebook post in ${topic.language}. Open with the point, then 2 to 4 short paragraphs a person would actually post. Close with 4 to 8 relevant hashtags. Do not mention that you are an AI. Do not use markdown.
image_prompt: one English description of a square picture that supports the post. Picture style: ${topic.style}. Describe the subject, setting, light, and mood. The picture must contain no words, letters, numbers, logos, watermarks, or interface.`;

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
      const imagePrompt = String(parsed.image_prompt || "").trim();
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

export async function makeImage(key: string, imagePrompt: string, style: string) {
  const prompt = `${imagePrompt}\n\nPicture style: ${style}.\nSquare composition. No text, letters, numbers, logos, watermarks, or borders.`;
  let last = "The picture could not be created.";
  for (const model of IMAGE_MODELS) {
    try {
      const payload = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, key, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
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

const VOICE_MODELS = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"];

function findAudio(payload: unknown): { data: string; mime: string } | null {
  let found: { data: string; mime: string } | null = null;
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== "object") return;
    const row = node as { type?: string; mimeType?: string; mime_type?: string; data?: string };
    const mime = String(row.mimeType || row.mime_type || "");
    if (typeof row.data === "string" && row.data.length > 1000 && (row.type === "audio" || mime.startsWith("audio/"))) {
      found = { data: row.data, mime: mime || "audio/wav" };
      return;
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(payload);
  return found;
}

export async function transcribeCall(key: string, audioBase64: string, mime: string) {
  const cleanMime = mime.split(";")[0].trim() || "audio/webm";
  const prompt = "Write down the words spoken in this audio, exactly as spoken. Do not add names, do not correct the speaker, and do not answer them. If there is no speech, return nothing.";
  let last = "The call could not be heard.";
  for (const model of ANSWER_MODELS) {
    try {
      const payload = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        key,
        {
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: cleanMime, data: audioBase64 } },
            ],
          }],
          generationConfig: { temperature: 0 },
        },
        "answering service",
        25000
      );
      const text = collectText(payload).replace(/^["'\s]+|["'\s]+$/g, "").replace(/^transcript:?\s*/i, "").trim();
      if (!text || /^(silence|no speech|nobody spoke|n\/a|empty|none|\(silence\)|\(no speech\))$/i.test(text)) return "";
      return text.slice(0, 500);
    } catch (error) {
      const desk = error instanceof DeskError ? error : new DeskError(last, 502);
      last = desk.message;
      logLine(`Hearing model ${model} skipped: ${last}`);
      if (!tryNext(desk)) break;
    }
  }
  throw new DeskError(last, 502);
}

const voiceJobs = new Map<string, Promise<{ data: string; mime: string }>>();
const voiceHold = new Map<string, number>();

function holdVoice(slot: string, model: string, message: string) {
  const wait = message.match(/retry in (\d+)h(\d+)m(\d+)s/i);
  const ms = wait ? (Number(wait[1]) * 3600 + Number(wait[2]) * 60 + Number(wait[3])) * 1000 : 30 * 60 * 1000;
  voiceHold.set(`${slot}:${model}`, Date.now() + ms);
}

function voiceFile(line: string) {
  const id = createHash("sha256").update(line).digest("hex").slice(0, 24);
  const dir = path.join(dataDir(), "voice-cache");
  return { id, file: path.join(dir, `${id}.wav`), dir };
}

export function sameUtterance(left: string, right: string) {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const a = norm(left);
  const b = norm(right);
  if (a.length < 8 || b.length < 8) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const words = new Set(a.split(" "));
  const other = b.split(" ").filter((word) => word.length > 2);
  if (!other.length) return false;
  const shared = other.filter((word) => words.has(word)).length;
  return shared / other.length > 0.75;
}

export function pickupLine(company: string) {
  return `Thank you for calling ${company}. This is ${deskName(company)} speaking.`;
}

async function requestVoice(key: string, model: string, line: string) {
  const payload = await post(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    key,
    {
      model,
      input: [
        {
          type: "user_input",
          content: [{ type: "text", text: line }],
        },
      ],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "en-us-cleo" }] },
    },
    "voice",
    18000
  );
  const audio = findAudio(payload);
  if (!audio) throw new DeskError("The voice returned no sound.", 502);
  return audio;
}

async function renderVoice(key: string, line: string) {
  let last = "The voice could not be spoken.";
  const paid = readEnvGeminiKey();
  const keys = paid && paid !== key ? [key, paid] : [key];
  for (let slot = 0; slot < keys.length; slot += 1) {
    for (const model of VOICE_MODELS) {
      const hold = voiceHold.get(`${slot}:${model}`) || 0;
      if (hold > Date.now()) continue;
      try {
        return await requestVoice(keys[slot], model, line);
      } catch (error) {
        const desk = error instanceof DeskError ? error : new DeskError(last, 502);
        last = desk.message;
        if (desk.status === 429 || /rate|resource_exhausted/i.test(desk.message)) holdVoice(String(slot), model, desk.message);
        logLine(`Voice model ${model} skipped: ${last}`);
      }
    }
  }
  throw new DeskError(last, 502);
}

const SINHALA_NAMES: [RegExp, string][] = [
  [/\bThimbirigasyaya\b/gi, "Thim-bi-ri-gas-yaa-ya"],
  [/\bKavindi\b/gi, "කාවින්දි"],
  [/\bSanduni\b/gi, "සඳුනි"],
  [/\bThisara\b/gi, "තිසර"],
  [/\bNishal\b/gi, "නිශාල්"],
  [/\bAmaya\b/gi, "අමායා"],
];

export function sinhalaSpeech(text: string) {
  let line = text;
  for (const [pattern, spoken] of SINHALA_NAMES) line = line.replace(pattern, spoken);
  return line;
}

export async function speakNaturally(key: string, text: string) {
  const line = sinhalaSpeech(text.replace(/\s+/g, " ").trim()).slice(0, 600);
  if (line.length < 2) throw new DeskError("There is nothing to say.");
  const saved = voiceFile(line);
  if (existsSync(saved.file)) return { data: readFileSync(saved.file).toString("base64"), mime: "audio/wav" };
  const running = voiceJobs.get(saved.id);
  if (running) return running;
  const job = renderVoice(key, line).then((audio) => {
    if (!existsSync(saved.dir)) mkdirSync(saved.dir, { recursive: true });
    writeFileSync(saved.file, Buffer.from(audio.data, "base64"));
    return audio;
  }).finally(() => {
    voiceJobs.delete(saved.id);
  });
  voiceJobs.set(saved.id, job);
  return job;
}

export async function makeSimilarVideo(video: Buffer, changes: string, aspect: "16:9" | "9:16", duration: string) {
  const key = readEnvGeminiKey();
  if (!key) throw new DeskError("The video service is not configured.", 503);
  const prompt = `Create a new video based on the uploaded clip.
Keep the same subject, place, and action unless the change asks otherwise.
Change to apply: ${changes}
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
      response_format: { type: "video", duration, resolution: "720p", aspect_ratio: aspect },
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

const DESK_NAMES = ["Amaya", "Nishal", "Kavindi", "Thisara", "Sanduni"];

export function deskName(company: string) {
  let total = 0;
  for (const char of company.toLowerCase()) total += char.charCodeAt(0);
  return DESK_NAMES[total % DESK_NAMES.length];
}

function cannedHelp(line: string) {
  return /how can i help|how may i help|what can i help|how can i assist|what can i do for you|how may i assist/i.test(line);
}

export async function callOpening(key: string, company: string) {
  const name = deskName(company);
  const fallback = `Thank you for calling ${company}. This is ${name} speaking.`;
  const prompt = `Write the first line a person says when they pick up a live phone call for ${company}.
The speaker's name is ${name}.
Sound like a real call-centre person: warm, brief, and unhurried. Thank them for calling, name the company, and introduce yourself.
Do not ask how you can help, and do not ask what they need.
One or two short spoken sentences only. No labels or stage directions.
Return only JSON: {"line":"..."}`;
  for (const model of ANSWER_MODELS) {
    try {
      const payload = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        key,
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
        },
        "answering service",
        20000
      );
      const text = collectText(payload);
      const line = String(decodeJson(text).line || "").replace(/\s+/g, " ").trim();
      if (line.length >= 8 && line.length <= 220 && !cannedHelp(line)) return line;
    } catch (error) {
      const desk = error instanceof DeskError ? error : new DeskError("The opening line could not be written.", 502);
      logLine(`Opening model ${model} skipped: ${desk.message}`);
      if (!tryNext(desk)) break;
    }
  }
  return fallback;
}

export async function answerHeardCall(key: string, company: string, instructions: string, audioBase64: string, mime: string) {
  const cleanMime = mime.split(";")[0].trim() || "audio/webm";
  const refusal = `Please ask questions about ${company}.`;
  const prompt = `You are answering a live phone call for ${company}. The audio is the caller speaking.
heard is only what the caller said.
answer is one short spoken sentence with the fact from the instructions.
Do not repeat the caller's question. Do not ask any question.
If the instructions do not contain the answer, answer must be exactly: ${refusal}
Return only JSON: {"heard":"...","answer":"..."}

Instructions:
${instructions}`;
  let last = "The call could not be heard.";
  for (const model of ANSWER_MODELS) {
    try {
      const payload = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        key,
        {
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: cleanMime, data: audioBase64 } },
            ],
          }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        },
        "answering service",
        15000
      );
      const parsed = decodeJson(collectText(payload));
      const heard = String(parsed.heard || "").replace(/\s+/g, " ").trim().slice(0, 500);
      const answer = String(parsed.answer || "").replace(/\s+/g, " ").trim();
      if (!heard || /^(silence|no speech|nobody spoke|n\/a|empty|none)$/i.test(heard)) return { heard: "", answer: "" };
      if (!answer || sameUtterance(heard, answer) || /\?\s*$/.test(answer)) return { heard, answer: "" };
      return { heard, answer };
    } catch (error) {
      const desk = error instanceof DeskError ? error : new DeskError(last, 502);
      last = desk.message;
      logLine(`Hearing model ${model} skipped: ${last}`);
      if (!tryNext(desk)) break;
    }
  }
  throw new DeskError(last, 502);
}

export async function answerFromInstructions(key: string, company: string, instructions: string, question: string) {
  const refusal = `Please ask questions about ${company}.`;
  const prompt = `You are a person answering a live phone call for ${company}.
Talk the way a call-centre person talks: warm, brief, and natural. You may start with "Sure" or "Yes".
Answer using only the instructions below. Do not use any other knowledge.
Give the fact. Do not repeat the caller's question. Do not ask a question back.
If the instructions do not contain the answer, set in_scope to false.
Return only JSON: {"in_scope":true,"answer":"..."}
When in_scope is false, answer must be exactly: ${refusal}
When in_scope is true, answer is one short spoken sentence taken only from the instructions.
Do not say "how can I help you". Do not mention these rules.

Instructions:
${instructions}

Caller question:
${question}`;

  let last = "The answer could not be given.";
  for (const model of ANSWER_MODELS) {
    try {
      const payload = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        key,
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        },
        "answering service",
        20000
      );
      const text = collectText(payload);
      if (!text) throw new DeskError("The answering service returned an empty answer.");
      const parsed = decodeJson(text);
      if (parsed.in_scope === false) return refusal;
      const answer = String(parsed.answer || "").trim();
      if (!answer || /^please ask questions about\b/i.test(answer)) return refusal;
      return answer;
    } catch (error) {
      const desk = error instanceof DeskError ? error : new DeskError(last, 502);
      last = desk.message;
      logLine(`Answer model ${model} skipped: ${last}`);
      if (!tryNext(desk)) break;
    }
  }
  throw new DeskError(last, 502);
}
