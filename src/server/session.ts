import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { cookies } from "next/headers";
import { dataDir } from "./paths";

const COOKIE = "smtools_session";
const FLASH = "smtools_flash";

export type SessionData = {
  uid?: string;
  csrf: string;
  oauth?: string;
};

function secret() {
  const file = path.join(dataDir(), "session.secret");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("hex"));
  return readFileSync(file, "utf8").trim();
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

function encode(data: SessionData) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(value: string): SessionData | null {
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expected = sign(body);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionData;
    if (!data || typeof data.csrf !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

async function jar() {
  return cookies();
}

export async function readSession(): Promise<SessionData> {
  const raw = (await jar()).get(COOKIE)?.value || "";
  return decode(raw) || { csrf: randomBytes(16).toString("hex") };
}

export async function writeSession(data: SessionData) {
  (await jar()).set(COOKIE, encode(data), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession() {
  const store = await jar();
  store.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  store.set(FLASH, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export function csrfMatches(session: SessionData, sent: string) {
  if (!sent || !session.csrf) return false;
  const left = Buffer.from(sent);
  const right = Buffer.from(session.csrf);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function setFlash(message: string) {
  (await jar()).set(FLASH, encodeURIComponent(message).slice(0, 500), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 120,
  });
}

export async function takeFlash() {
  const store = await jar();
  const raw = store.get(FLASH)?.value || "";
  if (!raw) return "";
  store.set(FLASH, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
