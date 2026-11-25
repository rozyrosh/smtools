import { AsyncLocalStorage } from "async_hooks";
import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { dataDir, DeskError, readPaidGeminiKey } from "./paths";

export type ConnectedPage = {
  id: string;
  name: string;
  token: string;
  active: boolean;
  picture?: string;
};

export type Settings = {
  gemini_api_key: string;
  fb_app_id: string;
  fb_app_secret: string;
  fb_page_id: string;
  fb_page_name: string;
  fb_page_token: string;
  fb_pages: ConnectedPage[];
  li_client_id: string;
  li_client_secret: string;
  li_org_id: string;
  li_org_name: string;
  li_access_token: string;
  li_orgs: ConnectedPage[];
  post_facebook: boolean;
  post_linkedin: boolean;
  page_voice: string;
  language: string;
  tone: string;
  style: string;
  quality: string;
  ratio: string;
  cron_key: string;
  allow_studio_key: boolean;
};

export type PostedLink = {
  id: string;
  name: string;
  url: string;
};

export type ScheduleRun = {
  id: string;
  caption: string;
  status: string;
  error: string;
  fb_post_id: string;
  fb_url: string;
  fb_posts?: PostedLink[];
  li_posts?: PostedLink[];
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
  quality: string;
  ratio: string;
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
  fb_posts?: PostedLink[];
  li_post_id?: string;
  li_url?: string;
  li_posts?: PostedLink[];
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
  fb_pages: [],
  li_client_id: "",
  li_client_secret: "",
  li_org_id: "",
  li_org_name: "",
  li_access_token: "",
  li_orgs: [],
  post_facebook: true,
  post_linkedin: true,
  page_voice: "",
  language: "Sinhala",
  tone: "Friendly",
  style: "Photograph",
  quality: "1K",
  ratio: "1:1",
  cron_key: "",
  allow_studio_key: false,
});

function asPages(value: unknown): ConnectedPage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { id?: unknown; name?: unknown; token?: unknown; active?: unknown; picture?: unknown };
      const id = String(row.id || "").trim();
      const token = String(row.token || "").trim();
      if (!id || !token) return null;
      const picture = String(row.picture || "").trim();
      return {
        id,
        name: String(row.name || "Page").trim() || "Page",
        token,
        active: row.active !== false,
        ...(picture ? { picture } : {}),
      };
    })
    .filter((item): item is ConnectedPage => !!item);
}

/** Migrate legacy single-slot FB/LI fields into arrays and keep scalars in sync. */
export function normalizeSettings(settings: Settings): Settings {
  const next = { ...settings };
  next.fb_pages = asPages(next.fb_pages);
  next.li_orgs = asPages(next.li_orgs);

  if (!next.fb_pages.length && next.fb_page_id && next.fb_page_token) {
    next.fb_pages = [{
      id: next.fb_page_id,
      name: next.fb_page_name || "Page",
      token: next.fb_page_token,
      active: next.post_facebook !== false,
    }];
  }
  if (!next.li_orgs.length && next.li_org_id && next.li_access_token) {
    next.li_orgs = [{
      id: next.li_org_id.replace(/^urn:li:organization:/, ""),
      name: next.li_org_name || "LinkedIn company",
      token: next.li_access_token,
      active: next.post_linkedin !== false,
    }];
  }

  const primaryFb = next.fb_pages.find((page) => page.active) || next.fb_pages[0] || null;
  next.fb_page_id = primaryFb?.id || "";
  next.fb_page_name = primaryFb?.name || "";
  next.fb_page_token = primaryFb?.token || "";
  next.post_facebook = next.fb_pages.some((page) => page.active);

  const primaryLi = next.li_orgs.find((page) => page.active) || next.li_orgs[0] || null;
  next.li_org_id = primaryLi?.id || "";
  next.li_org_name = primaryLi?.name || "";
  next.li_access_token = primaryLi?.token || "";
  next.post_linkedin = next.li_orgs.some((page) => page.active);

  return next;
}

export function upsertPage(
  list: ConnectedPage[],
  page: { id: string; name: string; token: string; picture?: string },
  active = true
) {
  const id = page.id.trim();
  const prev = list.find((item) => item.id === id);
  const next = list.filter((item) => item.id !== id);
  const picture = String(page.picture || prev?.picture || "").trim();
  next.push({
    id,
    name: page.name.trim() || "Page",
    token: page.token.trim(),
    active,
    ...(picture ? { picture } : {}),
  });
  return next;
}

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
  let settings = normalizeSettings({ ...defaults(), ...saved });
  if (!settings.cron_key) {
    settings = { ...settings, cron_key: randomBytes(16).toString("hex") };
    writeJson(deskPath("settings"), settings);
  }
  return settings;
}

export function saveSettings(settings: Settings) {
  writeJson(deskPath("settings"), normalizeSettings(settings));
}

export function geminiKey() {
  const paid = readPaidGeminiKey();
  if (paid) return { key: paid, source: "paid" };
  return { key: "", source: "" };
}

export function readTopics(): Topic[] {
  const topics = readJson<unknown[]>(deskPath("topics"), []);
  return topics.filter((item): item is Topic => !!item && typeof item === "object");
}

export function saveTopics(topics: Topic[]) {
  writeJson(deskPath("topics"), topics);
}

export function findTopic(id: string) {
  return readTopics().find((topic) => topic.id === id) || null;
}

export function readPending() {
  const file = deskPath("pending");
  const rows = readJson<unknown[]>(file, []);
  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: string; name?: string; token?: string; picture?: string };
    if (!row.id || !row.token) return [];
    const picture = String(row.picture || "").trim();
    return [{
      id: String(row.id),
      name: String(row.name || "Page"),
      token: String(row.token),
      ...(picture ? { picture } : {}),
    }];
  });
}

export function savePending(pages: { id: string; name: string; token: string; picture?: string }[]) {
  writeJson(deskPath("pending"), pages);
}

export function clearPending() {
  const file = deskPath("pending");
  if (existsSync(file)) unlinkSync(file);
}
