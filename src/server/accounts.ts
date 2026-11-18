import { randomBytes, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { dataDir, DeskError, limitText, randomId } from "./paths";
import { bind, transaction } from "./store";
import { clearSession, readSession, writeSession } from "./session";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  studio_key: boolean;
};

type Account = PublicUser & { password_hash: string; created_at: string };

function accountsFile() {
  return path.join(dataDir(), "accounts.json");
}

function readAll(): Account[] {
  if (!existsSync(accountsFile())) return [];
  try {
    const data = JSON.parse(readFileSync(accountsFile(), "utf8"));
    return Array.isArray(data) ? data.filter((item) => item && typeof item === "object") : [];
  } catch {
    return [];
  }
}

function writeAll(accounts: Account[]) {
  const file = accountsFile();
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(accounts, null, 2));
  if (existsSync(file)) unlinkSync(file);
  renameSync(tmp, file);
}

function publicUser(account: Account): PublicUser {
  return {
    id: String(account.id || ""),
    name: String(account.name || ""),
    email: String(account.email || ""),
    studio_key: !!account.studio_key,
  };
}

async function enter(id: string) {
  await writeSession({ uid: id, csrf: randomBytes(16).toString("hex") });
  bind(id);
}

export async function register(name: string, email: string, password: string) {
  const cleanName = limitText(name, 60);
  const cleanEmail = email.trim().toLowerCase();
  if (cleanName.length < 2) throw new DeskError("Add your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new DeskError("That email does not look right.");
  if (password.length < 8) throw new DeskError("Use a password of at least 8 characters.");
  const user = await transaction(async () => {
    const accounts = readAll();
    if (accounts.some((account) => account.email.toLowerCase() === cleanEmail)) {
      throw new DeskError("That email already has a desk.");
    }
    const id = randomId("usr");
    const dir = path.join(dataDir(), "desks", id);
    mkdirSync(dir, { recursive: true });
    let studio = false;
    if (accounts.length === 0 && existsSync(path.join(dataDir(), "settings.json"))) {
      studio = true;
      inheritLegacy(dir);
    }
    const record: Account = {
      id,
      name: cleanName,
      email: cleanEmail,
      password_hash: bcrypt.hashSync(password, 10),
      studio_key: studio,
      created_at: new Date().toISOString(),
    };
    accounts.push(record);
    writeAll(accounts);
    return publicUser(record);
  });
  await enter(user.id);
  return user;
}

export async function login(email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  const found = readAll().find((account) => account.email.toLowerCase() === cleanEmail);
  const hash = found?.password_hash || "";
  const normalized = hash.replace(/^\$2y\$/, "$2b$");
  const ok = !!found && !!hash && bcrypt.compareSync(password, normalized);
  if (!ok || !found) throw new DeskError("That email or password does not match.");
  const user = publicUser(found);
  await enter(user.id);
  return user;
}

export async function logout() {
  await clearSession();
  bind(null);
}

export async function current(): Promise<PublicUser | null> {
  const session = await readSession();
  if (!session.uid || !/^usr_[a-f0-9]{12}$/.test(session.uid)) return null;
  const found = readAll().find((account) => account.id === session.uid);
  if (!found) return null;
  bind(found.id);
  return publicUser(found);
}

export async function requireUser() {
  const user = await current();
  if (!user) redirect("/login");
  return user;
}

export async function requireApi() {
  const user = await current();
  if (!user) throw new DeskError("Sign in to use the desk.", 401);
  return user;
}

export function idForCronKey(key: string) {
  if (!key) return "";
  const root = path.join(dataDir(), "desks");
  if (!existsSync(root)) return "";
  for (const id of readdirSync(root)) {
    if (!/^usr_[a-f0-9]{12}$/.test(id)) continue;
    const file = path.join(root, id, "settings.json");
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as { cron_key?: string };
      const saved = String(data.cron_key || "");
      if (!saved) continue;
      const left = Buffer.from(saved);
      const right = Buffer.from(key);
      if (left.length === right.length && timingSafeEqual(left, right)) return id;
    } catch {
      continue;
    }
  }
  return "";
}

function inheritLegacy(dir: string) {
  const settingsPath = path.join(dataDir(), "settings.json");
  const topicsPath = path.join(dataDir(), "topics.json");
  if (existsSync(settingsPath)) {
    const raw = JSON.parse(readFileSync(settingsPath, "utf8"));
    const settings = raw && typeof raw === "object" ? raw : {};
    settings.allow_studio_key = true;
    writeFileSync(path.join(dir, "settings.json"), JSON.stringify(settings, null, 2));
    unlinkSync(settingsPath);
  }
  if (existsSync(topicsPath)) renameSync(topicsPath, path.join(dir, "topics.json"));
}
