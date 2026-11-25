import { randomBytes } from "crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export const GRAPH_VERSION = "v23.0";
export const STUDIO_ENV = "C:/xampp/htdocs/sinhala_studio/.env";

function hostingerKeep() {
  const cwd = process.cwd();
  const marker = `${path.sep}hbuilds${path.sep}versions${path.sep}`;
  const at = cwd.indexOf(marker);
  if (at < 0) return "";
  return path.join(cwd.slice(0, at), "smtools-data");
}

function useDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function copyMissing(from: string, to: string) {
  if (!existsSync(from) || existsSync(to)) return;
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

let recovered = false;

function recoverHostedAccounts(dir: string) {
  if (recovered || existsSync(path.join(dir, "accounts.json"))) {
    recovered = true;
    return;
  }
  recovered = true;
  const versions = path.resolve(process.cwd(), "..", "..");
  if (!existsSync(versions)) return;
  let best: { email: string; created_at: string; raw: Record<string, unknown>; from: string }[] = [];
  for (const version of readdirSync(versions)) {
    const file = path.join(versions, version, "nodejs", "data", "accounts.json");
    if (!existsSync(file)) continue;
    try {
      const rows = JSON.parse(readFileSync(file, "utf8"));
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const email = String((row as { email?: string }).email || "").toLowerCase();
        if (!email) continue;
        const created = String((row as { created_at?: string }).created_at || "");
        const current = best.find((item) => item.email === email);
        if (!current || created > current.created_at) {
          if (current) best = best.filter((item) => item.email !== email);
          best.push({ email, created_at: created, raw: row as Record<string, unknown>, from: path.join(versions, version, "nodejs", "data") });
        }
      }
    } catch {
      continue;
    }
  }
  if (!best.length) return;
  writeRecovered(dir, best);
}

function writeRecovered(dir: string, best: { raw: Record<string, unknown>; from: string }[]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "accounts.json"), JSON.stringify(best.map((item) => item.raw), null, 2));
  for (const item of best) {
    const id = String(item.raw.id || "");
    if (!/^usr_[a-f0-9]{12}$/.test(id)) continue;
    copyMissing(path.join(item.from, "desks", id), path.join(dir, "desks", id));
  }
}

let announced = false;

export function dataDir() {
  const hosted = process.env["DATA_DIR"]?.trim() || hostingerKeep();
  const dir = useDir(hosted || path.join(process.cwd(), "data"));
  if (hosted) {
    recoverHostedAccounts(dir);
    copyMissing(path.join(process.cwd(), "data", "accounts.json"), path.join(dir, "accounts.json"));
    copyMissing(path.join(process.cwd(), "data", "desks"), path.join(dir, "desks"));
    copyMissing(path.join(process.cwd(), "data", "session.secret"), path.join(dir, "session.secret"));
  }
  if (!announced) {
    announced = true;
    console.log(`Account files are kept in ${dir}`);
  }
  return dir;
}

export function imageDir() {
  const hosted = process.env["DATA_DIR"]?.trim() || hostingerKeep();
  const dir = useDir(hosted ? path.join(hosted, "images") : path.join(process.cwd(), "storage", "images"));
  if (hosted) copyMissing(path.join(process.cwd(), "storage", "images"), dir);
  return dir;
}

export function videoDir() {
  const hosted = process.env["DATA_DIR"]?.trim() || hostingerKeep();
  const dir = useDir(hosted ? path.join(hosted, "videos") : path.join(process.cwd(), "storage", "videos"));
  if (hosted) copyMissing(path.join(process.cwd(), "storage", "videos"), dir);
  return dir;
}

export function audioDir() {
  const hosted = process.env["DATA_DIR"]?.trim() || hostingerKeep();
  const dir = useDir(hosted ? path.join(hosted, "audio") : path.join(process.cwd(), "storage", "audio"));
  if (hosted) copyMissing(path.join(process.cwd(), "storage", "audio"), dir);
  return dir;
}

function forwardedOrigin(request: Request) {
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
  if (!host || host.startsWith("0.0.0.0") || host.startsWith("127.0.0.1")) return "";
  const proto = (request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${host}`;
}

export function appOrigin(request?: Request) {
  const configured = process.env["APP_ORIGIN"]?.replace(/\/$/, "") || "";
  if (configured && !configured.includes("0.0.0.0")) return configured;
  if (request) {
    const forwarded = forwardedOrigin(request);
    if (forwarded) return forwarded;
    try {
      const origin = new URL(request.url).origin;
      if (!origin.includes("0.0.0.0")) return origin;
    } catch {
      return "http://localhost:3000";
    }
  }
  return "http://localhost:3000";
}

export function facebookRedirect(request?: Request) {
  return `${appOrigin(request)}/api/facebook/callback`;
}

function readEnvFileValue(name: string) {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  if (!existsSync(STUDIO_ENV)) return "";
  const raw = readFileSync(STUDIO_ENV, "utf8");
  const match = raw.match(new RegExp(`^${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(\\S+))`, "m"));
  if (!match) return "";
  return (match[1] || match[2] || match[3] || "").trim();
}

export function readPaidGeminiKey() {
  return readEnvFileValue("GEMINI_PAID_API_KEY") || readEnvFileValue("GEMINI_API_KEY");
}

export function readFreeGeminiKey() {
  const named = readEnvFileValue("GEMINI_FREE_API_KEY");
  if (named) return named;
  const testFile = path.join(dataDir(), "gemini.test");
  if (!existsSync(testFile)) return "";
  return readFileSync(testFile, "utf8").trim();
}

export function readStudioGeminiKey() {
  return readPaidGeminiKey();
}

export function readEnvGeminiKey() {
  return readPaidGeminiKey();
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
