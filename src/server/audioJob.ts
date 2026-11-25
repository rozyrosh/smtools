import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { consumeCredit, requireCredit } from "./accounts";
import { makeSpeech, TTS_VOICES } from "./gemini";
import { audioDir, DeskError, randomId } from "./paths";

export type AudioHistoryItem = {
  id: string;
  url: string;
  mime: string;
  voice: string;
  style: string;
  text: string;
  preview: string;
  created_at: string;
};

type AudioMeta = AudioHistoryItem & { user_id: string };

export function chosenVoice(raw: string) {
  const picked = String(raw || "").trim();
  if ((TTS_VOICES as readonly string[]).includes(picked)) return picked;
  return "Kore";
}

function metaPath(id: string) {
  return path.join(audioDir(), `${id}.json`);
}

function audioFilePath(id: string, mime: string) {
  const ext = mime.includes("mpeg") ? "mp3" : mime.includes("ogg") ? "ogg" : "wav";
  return path.join(audioDir(), `${id}.${ext}`);
}

function readMeta(id: string): AudioMeta | null {
  try {
    const raw = JSON.parse(readFileSync(metaPath(id), "utf8")) as Partial<AudioMeta>;
    if (!raw?.id || !raw.user_id) return null;
    return {
      id: String(raw.id),
      user_id: String(raw.user_id),
      url: String(raw.url || `/api/audio/${raw.id}`),
      mime: String(raw.mime || "audio/wav"),
      voice: String(raw.voice || "Kore"),
      style: String(raw.style || ""),
      text: String(raw.text || ""),
      preview: String(raw.preview || ""),
      created_at: String(raw.created_at || ""),
    };
  } catch {
    return null;
  }
}

export function listSpeechHistory(userId: string, limit = 40): AudioHistoryItem[] {
  if (!/^usr_[a-f0-9]{12}$/.test(userId)) return [];
  const root = audioDir();
  const rows: AudioHistoryItem[] = [];
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    if (!/^aud_[a-f0-9]{12}$/.test(id)) continue;
    const meta = readMeta(id);
    if (!meta || meta.user_id !== userId) continue;
    if (!existsSync(audioFilePath(id, meta.mime))) continue;
    rows.push({
      id: meta.id,
      url: meta.url,
      mime: meta.mime,
      voice: meta.voice,
      style: meta.style,
      text: meta.text,
      preview: meta.preview,
      created_at: meta.created_at,
    });
  }
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, Math.max(1, Math.min(limit, 100)));
}

export function ownsSpeech(userId: string, id: string) {
  const meta = readMeta(id);
  if (!meta) return false;
  return meta.user_id === userId;
}

export function deleteSpeech(userId: string, id: string) {
  if (!/^aud_[a-f0-9]{12}$/.test(id)) throw new DeskError("That audio is no longer here.");
  const meta = readMeta(id);
  if (!meta || meta.user_id !== userId) throw new DeskError("That audio is no longer here.", 404);
  const file = audioFilePath(id, meta.mime);
  const typeFile = path.join(audioDir(), `${id}.type`);
  try {
    if (existsSync(file)) unlinkSync(file);
  } catch {
    /* ignore */
  }
  try {
    if (existsSync(typeFile)) unlinkSync(typeFile);
  } catch {
    /* ignore */
  }
  try {
    if (existsSync(metaPath(id))) unlinkSync(metaPath(id));
  } catch {
    /* ignore */
  }
  return { ok: true as const, id };
}

export async function createSpeech(userId: string, textRaw: string, voiceRaw: string, styleRaw: string) {
  if (!/^usr_[a-f0-9]{12}$/.test(userId)) throw new DeskError("Sign in to use the desk.", 401);
  requireCredit("audio", userId);
  const text = String(textRaw || "").replace(/\s+/gu, " ").trim();
  const voice = chosenVoice(voiceRaw);
  const style = String(styleRaw || "").trim().slice(0, 240);
  const made = await makeSpeech(text, voice, style);
  const id = randomId("aud");
  const ext = made.mime.includes("mpeg") ? "mp3" : made.mime.includes("ogg") ? "ogg" : "wav";
  const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  const created_at = new Date().toISOString();
  const url = `/api/audio/${id}`;
  writeFileSync(path.join(audioDir(), `${id}.${ext}`), made.bytes);
  writeFileSync(path.join(audioDir(), `${id}.type`), made.mime);
  const meta: AudioMeta = {
    id,
    user_id: userId,
    url,
    mime: made.mime,
    voice,
    style,
    text,
    preview,
    created_at,
  };
  writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
  consumeCredit("audio", userId);
  return { id, url, mime: made.mime, voice, style, text, preview, created_at };
}
