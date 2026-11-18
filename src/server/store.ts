import { AsyncLocalStorage } from "async_hooks";
import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { dataDir, DeskError, randomId, readStudioGeminiKey } from "./paths";

export type Settings = {
  gemini_api_key: string;
  fb_app_id: string;
  fb_app_secret: string;
  fb_page_id: string;
  fb_page_name: string;
  fb_page_token: string;
  page_voice: string;
  language: string;
  tone: string;
  style: string;
  cron_key: string;
  allow_studio_key: boolean;
};

export type ScheduleRun = {
  id: string;
  caption: string;
  status: string;
  error: string;
  fb_post_id: string;
  fb_url: string;
  created_at: string;
  posted_at: string;
};

export type Topic = {
  id: string;
  title: string;
  about: string;
  language: string;
  tone: string;
  style: string;
  schedule: string;
  time: string;
  weekday: number;
  monthday: number;
  last_slot: string;
  fail_slot: string;
  autopost: boolean;
  active?: boolean;
  paused_at?: string;
  runs?: ScheduleRun[];
  current_run?: string;
  status: string;
  caption: string;
  image_prompt: string;
  error: string;
  fb_post_id: string;
  fb_url: string;
  attempts: number;
  created_at: string;
  updated_at: string;
  posted_at: string;
};

const defaults = (): Settings => ({
  gemini_api_key: "",
  fb_app_id: "",
  fb_app_secret: "",
  fb_page_id: "",
  fb_page_name: "",
  fb_page_token: "",
  page_voice: "",
  language: "Sinhala",
  tone: "Friendly",
  style: "Photograph",
  cron_key: "",
  allow_studio_key: false,
});

const localUser = new AsyncLocalStorage<string>();
let scope: string | null = null;
let chain: Promise<unknown> = Promise.resolve();

export function bind(userId: string | null) {
  if (userId !== null && !/^usr_[a-f0-9]{12}$/.test(userId)) {
    throw new DeskError("That account is not valid.");
  }
  scope = userId;
}

export function runAs<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  if (!/^usr_[a-f0-9]{12}$/.test(userId)) {
    throw new DeskError("That account is not valid.");
  }
  return localUser.run(userId, fn);
}

export function currentScope() {
  return localUser.getStore() ?? scope;
}

export function transaction<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = chain.then(() => fn());
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function deskPath(name: string) {
  const id = currentScope();
  if (!id) throw new DeskError("Sign in before using the desk.", 401);
  const dir = path.join(dataDir(), "desks", id);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return path.join(dir, `${name}.json`);
}

function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, json);
  if (existsSync(file)) unlinkSync(file);
  renameSync(tmp, file);
}

export function readSettings(): Settings {
  const saved = readJson<Partial<Settings>>(deskPath("settings"), {});
  const settings = { ...defaults(), ...saved };
  if (!settings.cron_key) {
    settings.cron_key = randomBytes(16).toString("hex");
    writeJson(deskPath("settings"), settings);
  }
  return settings;
}

export function saveSettings(settings: Settings) {
  writeJson(deskPath("settings"), settings);
}

export function geminiKey() {
  const studio = readStudioGeminiKey();
  if (studio) return { key: studio, source: "house" };
  return { key: "", source: "" };
}

export function readTopics(): Topic[] {
  const topics = readJson<unknown[]>(deskPath("topics"), []);
  return topics.filter((item): item is Topic => !!item && typeof item === "object");
}

export function saveTopics(topics: Topic[]) {
  writeJson(deskPath("topics"), topics);
}

export type CallAgent = {
  id: string;
  name: string;
  company: string;
  instructions: string;
  active: boolean;
  created_at: string;
  widget_name: string;
  widget_label: boolean;
  widget_chat: boolean;
  widget_color: string;
  widget_greeting: string;
  widget_pages: string;
  widget_on: boolean;
};

export function normalizeStoredAgent(item: Partial<CallAgent>): { agent: CallAgent | null; dirty: boolean } {
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const company = typeof item.company === "string" ? item.company.trim() : "";
  const instructions = typeof item.instructions === "string" ? item.instructions.trim() : "";
  if (name.length < 2 || company.length < 2 || instructions.length < 8) return { agent: null, dirty: false };
  let dirty = false;
  let id = typeof item.id === "string" ? item.id : "";
  if (!/^call_[a-f0-9]{12}$/.test(id)) {
    id = "";
    dirty = true;
  }
  const created_at = typeof item.created_at === "string" && item.created_at ? item.created_at : new Date().toISOString();
  const active = item.active !== false;
  const widget_name = typeof item.widget_name === "string" && item.widget_name.trim() ? item.widget_name.trim().slice(0, 40) : name;
  const widget_label = item.widget_label === true;
  const widget_chat = item.widget_chat === true;
  const rawColor = typeof item.widget_color === "string" ? item.widget_color.trim() : "";
  const widget_color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor.toLowerCase() : "#2563eb";
  const widget_greeting = typeof item.widget_greeting === "string" && item.widget_greeting.trim()
    ? item.widget_greeting.trim().slice(0, 200)
    : `Hello. Ask me about ${company}.`;
  const widget_pages = typeof item.widget_pages === "string" && item.widget_pages.trim() ? item.widget_pages.trim() : "*";
  const widget_on = item.widget_on === true;
  if (
    item.id !== id ||
    item.created_at !== created_at ||
    typeof item.active !== "boolean" ||
    item.widget_name !== widget_name ||
    item.widget_label !== widget_label ||
    item.widget_chat !== widget_chat ||
    item.widget_color !== widget_color ||
    item.widget_greeting !== widget_greeting ||
    item.widget_pages !== widget_pages ||
    item.widget_on !== widget_on
  ) {
    dirty = true;
  }
  if (!id) return { agent: null, dirty };
  return {
    agent: { id, name, company, instructions, active, created_at, widget_name, widget_label, widget_chat, widget_color, widget_greeting, widget_pages, widget_on },
    dirty,
  };
}

export function readCallAgents(): CallAgent[] {
  const saved = readJson<unknown>(deskPath("call"), []);
  const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? [saved] : [];
  let dirty = !Array.isArray(saved);
  const agents: CallAgent[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    let source = row as Partial<CallAgent>;
    if (!/^call_[a-f0-9]{12}$/.test(String(source.id || ""))) {
      const name = typeof source.name === "string" ? source.name.trim() : "";
      if (name.length < 2) continue;
      source = { ...source, id: randomId("call") };
      dirty = true;
    }
    const parsed = normalizeStoredAgent(source);
    if (!parsed.agent) continue;
    if (parsed.dirty) dirty = true;
    agents.push(parsed.agent);
  }
  if (dirty) writeJson(deskPath("call"), agents);
  return agents;
}

export function findPublicCallAgent(id: string): CallAgent | null {
  if (!/^call_[a-f0-9]{12}$/.test(id)) return null;
  const root = path.join(dataDir(), "desks");
  if (!existsSync(root)) return null;
  for (const userId of readdirSync(root)) {
    if (!/^usr_[a-f0-9]{12}$/.test(userId)) continue;
    const file = path.join(root, userId, "call.json");
    if (!existsSync(file)) continue;
    let saved: unknown;
    try {
      saved = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? [saved] : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const parsed = normalizeStoredAgent(row as Partial<CallAgent>);
      if (parsed.agent?.id === id) return parsed.agent;
    }
  }
  return null;
}

export function saveCallAgents(agents: CallAgent[]) {
  writeJson(deskPath("call"), agents);
}

export function findTopic(id: string) {
  return readTopics().find((topic) => topic.id === id) || null;
}

export function readPending() {
  const file = deskPath("pending");
  const rows = readJson<unknown[]>(file, []);
  return rows.filter((item): item is { id: string; name: string; token: string } => {
    if (!item || typeof item !== "object") return false;
    const row = item as { id?: string; token?: string };
    return !!row.id && !!row.token;
  });
}

export function savePending(pages: { id: string; name: string; token: string }[]) {
  writeJson(deskPath("pending"), pages);
}

export function clearPending() {
  const file = deskPath("pending");
  if (existsSync(file)) unlinkSync(file);
}
