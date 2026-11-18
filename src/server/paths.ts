import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";

export const GRAPH_VERSION = "v23.0";
export const STUDIO_ENV = "C:/xampp/htdocs/sinhala_studio/.env";

export function dataDir() {
  const dir = path.join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function imageDir() {
  const dir = path.join(process.cwd(), "storage", "images");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function videoDir() {
  const dir = path.join(process.cwd(), "storage", "videos");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function appOrigin(request?: Request) {
  const configured = process.env.APP_ORIGIN?.replace(/\/$/, "");
  if (configured) return configured;
  if (request) return new URL(request.url).origin;
  return "http://localhost:3000";
}

export function facebookRedirect(request?: Request) {
  return `${appOrigin(request)}/api/facebook/callback`;
}

function readEnvFileKey() {
  if (!existsSync(STUDIO_ENV)) return "";
  const raw = readFileSync(STUDIO_ENV, "utf8");
  const quoted = raw.match(/^GEMINI_API_KEY\s*=\s*"([^"]+)"/m);
  if (quoted) return quoted[1].trim();
  const single = raw.match(/^GEMINI_API_KEY\s*=\s*'([^']+)'/m);
  if (single) return single[1].trim();
  const plain = raw.match(/^GEMINI_API_KEY\s*=\s*(\S+)/m);
  return plain ? plain[1].replace(/^["']|["']$/g, "").trim() : "";
}

export function readStudioGeminiKey() {
  const testFile = path.join(dataDir(), "gemini.test");
  if (existsSync(testFile)) {
    const test = readFileSync(testFile, "utf8").trim();
    if (test) return test;
  }
  return readEnvFileKey();
}

export function readEnvGeminiKey() {
  return readEnvFileKey();
}

export function maskSecret(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length < 12) return "saved";
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

export function publicError(message: string) {
  let text = message
    .replace(/(access_token|client_secret|api_key|key)=([^&\s]+)/gi, "$1=***")
    .replace(/AQ\.[A-Za-z0-9_\-]{8,}/g, "***")
    .replace(/generativelanguage\.googleapis\.com/gi, "")
    .replace(/\bgemini\b/gi, "")
    .replace(/\bgoogle\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > 420) text = `${text.slice(0, 420)}…`;
  return text;
}

export function limitText(value: string, max: number) {
  const cleaned = value.replace(/\s+/gu, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

export function randomId(prefix: string, bytes = 6) {
  return `${prefix}_${randomBytes(bytes).toString("hex")}`;
}

export class DeskError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(publicError(message));
    this.status = status;
  }
}
