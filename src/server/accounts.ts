import { randomBytes, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { dataDir, DeskError, limitText, randomId } from "./paths";
import { ACTION_COSTS } from "@/shared/creditCosts";
import {
  assertCredit,
  emptyUsage,
  normalizePlanId,
  normalizeUsage,
  PLANS,
  planCredits,
  remainingBalance,
  type CreditKind,
  type PlanId,
  type PlanUsage,
} from "./plans";
import { bind, currentScope, transaction } from "./store";
import { clearSession, readSession, writeSession } from "./session";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  studio_key: boolean;
  admin: boolean;
  plan: PlanId;
  usage: PlanUsage;
};

type Account = Omit<PublicUser, "plan" | "usage"> & {
  password_hash: string;
  created_at: string;
  disabled?: boolean;
  plan?: PlanId | string;
  usage?: PlanUsage;
};

function accountsFile() {
  return path.join(dataDir(), "accounts.json");
}

function applyBootstrap(accounts: Account[]) {
  const file = path.join(process.cwd(), "admin.bootstrap.json");
  if (!existsSync(file)) return accounts;
  try {
    const spec = JSON.parse(readFileSync(file, "utf8")) as { name?: string; email?: string; pass?: string };
    const email = String(spec.email || "").trim().toLowerCase();
    const pass = String(spec.pass || "");
    const name = limitText(String(spec.name || "Admin"), 60);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || pass.length < 8) return accounts;
    let account = accounts.find((item) => item.email.toLowerCase() === email);
    if (!account) {
      const id = randomId("usr");
      mkdirSync(path.join(dataDir(), "desks", id), { recursive: true });
      account = {
        id,
        name: name.length >= 2 ? name : "Admin",
        email,
        password_hash: bcrypt.hashSync(pass, 10),
        studio_key: false,
        admin: true,
        disabled: false,
        plan: "free",
        usage: emptyUsage(),
        created_at: new Date().toISOString(),
      };
      accounts.push(account);
    } else {
      account.admin = true;
      account.disabled = false;
      account.password_hash = bcrypt.hashSync(pass, 10);
    }
    writeAll(accounts);
    unlinkSync(file);
  } catch {
    return accounts;
  }
  return accounts;
}

function readAll(): Account[] {
  let accounts: Account[] = [];
  if (existsSync(accountsFile())) {
    try {
      const data = JSON.parse(readFileSync(accountsFile(), "utf8"));
      accounts = Array.isArray(data) ? data.filter((item) => item && typeof item === "object") : [];
    } catch {
      accounts = [];
    }
  }
  accounts = applyBootstrap(accounts);
  if (accounts.length && !accounts.some((account) => account.admin)) {
    const oldest = [...accounts].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))[0];
    oldest.admin = true;
    writeAll(accounts);
  }
  return accounts;
}

function writeAll(accounts: Account[]) {
  const file = accountsFile();
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(accounts, null, 2));
  if (existsSync(file)) unlinkSync(file);
  renameSync(tmp, file);
}

function accountPlan(account: Account): PlanId {
  return normalizePlanId(account.plan);
}

function accountUsage(account: Account): PlanUsage {
  return normalizeUsage(account.usage);
}

function publicUser(account: Account): PublicUser {
  return {
    id: String(account.id || ""),
    name: String(account.name || ""),
    email: String(account.email || ""),
    studio_key: !!account.studio_key,
    admin: !!account.admin,
    plan: accountPlan(account),
    usage: accountUsage(account),
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
      admin: accounts.length === 0,
      disabled: false,
      plan: "free",
      usage: emptyUsage(),
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
  if (found.disabled) throw new DeskError("This account is paused. Ask the admin to open it again.");
  const user = publicUser(found);
  await enter(user.id);
  return user;
}

export async function changePassword(currentPassword: string, nextPassword: string) {
  const session = await readSession();
  const accounts = readAll();
  const account = accounts.find((item) => item.id === session.uid);
  if (!account || account.disabled) throw new DeskError("Sign in to change the password.", 401);
  const hash = String(account.password_hash || "").replace(/^\$2y\$/, "$2b$");
  if (!hash || !bcrypt.compareSync(currentPassword, hash)) throw new DeskError("The current password does not match.");
  if (nextPassword.length < 8) throw new DeskError("Use a password of at least 8 characters.");
  account.password_hash = bcrypt.hashSync(nextPassword, 10);
  writeAll(accounts);
}

export async function changeName(nameInput: string) {
  const session = await readSession();
  const accounts = readAll();
  const account = accounts.find((item) => item.id === session.uid);
  if (!account || account.disabled) throw new DeskError("Sign in to change your name.", 401);
  const name = limitText(String(nameInput || ""), 60);
  if (name.length < 2) throw new DeskError("Add a name with at least 2 characters.");
  account.name = name;
  writeAll(accounts);
  return publicUser(account);
}

export async function logout() {
  await clearSession();
  bind(null);
}

export async function current(): Promise<PublicUser | null> {
  const session = await readSession();
  if (!session.uid || !/^usr_[a-f0-9]{12}$/.test(session.uid)) return null;
  const found = readAll().find((account) => account.id === session.uid);
  if (!found || found.disabled) return null;
  bind(found.id);
  return publicUser(found);
}

export async function requireUser() {
  const user = await current();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.admin) redirect("/dashboard");
  return user;
}

export function listAccounts() {
  return readAll().map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email,
    admin: !!account.admin,
    disabled: !!account.disabled,
    created_at: account.created_at,
    plan: accountPlan(account),
    usage: accountUsage(account),
  }));
}

export function updateAccount(
  id: string,
  input: { name: string; email: string; password: string; admin: boolean; disabled: boolean; plan?: string },
  actorId: string
) {
  const accounts = readAll();
  const account = accounts.find((item) => item.id === id);
  if (!account) throw new DeskError("That account is no longer here.");
  const name = limitText(input.name, 60);
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new DeskError("Add a name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DeskError("That email does not look right.");
  if (accounts.some((item) => item.id !== id && item.email.toLowerCase() === email)) {
    throw new DeskError("That email already has a desk.");
  }
  if (input.password && input.password.length < 8) throw new DeskError("Use a password of at least 8 characters.");
  const adminCount = accounts.filter((item) => item.admin).length;
  if (account.admin && !input.admin && adminCount <= 1) throw new DeskError("Keep at least one admin.");
  if (id === actorId && !input.admin) throw new DeskError("You stay an admin while you are signed in.");
  if (id === actorId && input.disabled) throw new DeskError("Your own admin sign-in stays open.");
  if (input.admin && input.disabled) throw new DeskError("An admin account stays able to sign in.");
  account.name = name;
  account.email = email;
  account.admin = input.admin;
  account.disabled = input.admin ? false : input.disabled;
  if (input.plan !== undefined) account.plan = normalizePlanId(input.plan);
  if (!account.usage) account.usage = emptyUsage();
  else account.usage = accountUsage(account);
  if (input.password) account.password_hash = bcrypt.hashSync(input.password, 10);
  writeAll(accounts);
}

export function setAccountPlan(id: string, planRaw: string, resetUsage = false) {
  const accounts = readAll();
  const account = accounts.find((item) => item.id === id);
  if (!account) throw new DeskError("That account is no longer here.");
  account.plan = normalizePlanId(planRaw);
  account.usage = resetUsage ? emptyUsage() : accountUsage(account);
  writeAll(accounts);
  return publicUser(account);
}

export function resetAccountUsage(id: string) {
  const accounts = readAll();
  const account = accounts.find((item) => item.id === id);
  if (!account) throw new DeskError("That account is no longer here.");
  account.usage = emptyUsage();
  writeAll(accounts);
  return publicUser(account);
}

export function planSnapshot(userId?: string | null) {
  const id = userId || currentScope();
  if (!id) throw new DeskError("Sign in to use the desk.", 401);
  const account = readAll().find((item) => item.id === id);
  if (!account || account.disabled) throw new DeskError("Sign in to use the desk.", 401);
  const plan = accountPlan(account);
  const usage = accountUsage(account);
  const def = PLANS[plan];
  const balance = remainingBalance(plan, usage);
  return {
    plan,
    name: def.name,
    priceUsd: def.priceUsd,
    usage,
    credits: planCredits(plan),
    balance,
    spent: usage.spent,
    features: def.features,
    costs: ACTION_COSTS,
  };
}

export function requireCredit(kind: CreditKind, userId?: string | null) {
  const id = userId || currentScope();
  if (!id) throw new DeskError("Sign in to use the desk.", 401);
  const account = readAll().find((item) => item.id === id);
  if (!account || account.disabled) throw new DeskError("Sign in to use the desk.", 401);
  const plan = accountPlan(account);
  const usage = accountUsage(account);
  assertCredit(plan, usage, kind);
  return {
    plan,
    usage,
    cost: ACTION_COSTS[kind],
    balance: remainingBalance(plan, usage),
    credits: planCredits(plan),
  };
}

export function consumeCredit(kind: CreditKind, userId?: string | null) {
  const id = userId || currentScope();
  if (!id) throw new DeskError("Sign in to use the desk.", 401);
  const accounts = readAll();
  const account = accounts.find((item) => item.id === id);
  if (!account || account.disabled) throw new DeskError("Sign in to use the desk.", 401);
  const plan = accountPlan(account);
  const usage = accountUsage(account);
  assertCredit(plan, usage, kind);
  usage.spent += ACTION_COSTS[kind];
  account.plan = plan;
  account.usage = usage;
  writeAll(accounts);
  return {
    plan,
    usage,
    cost: ACTION_COSTS[kind],
    balance: remainingBalance(plan, usage),
    credits: planCredits(plan),
  };
}

export function setAccountDisabled(id: string, disabled: boolean) {
  const accounts = readAll();
  const account = accounts.find((item) => item.id === id);
  if (!account) throw new DeskError("That account is no longer here.");
  if (account.admin && disabled) throw new DeskError("An admin account stays able to sign in.");
  account.disabled = disabled;
  writeAll(accounts);
}

export function removeAccount(id: string) {
  const accounts = readAll();
  const account = accounts.find((item) => item.id === id);
  if (!account) throw new DeskError("That account is no longer here.");
  if (account.admin) throw new DeskError("An admin account cannot be removed here.");
  writeAll(accounts.filter((item) => item.id !== id));
  const dir = path.join(dataDir(), "desks", id);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
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
