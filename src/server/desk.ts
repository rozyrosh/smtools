import { copyFileSync, existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { exchangeCode, listPages, pageInfo, publishPhoto } from "./facebook";
import { makeImage, writePost } from "./gemini";
import { appOrigin, DeskError, facebookRedirect, GRAPH_VERSION, imageDir, limitText, publicError, randomId } from "./paths";
import { takeFlash } from "./session";
import {
  clearPending,
  findTopic,
  geminiKey,
  readPending,
  readSettings,
  readTopics,
  savePending,
  saveSettings,
  saveTopics,
  transaction,
  type ScheduleRun,
  type Topic,
} from "./store";

export type PublicTopic = {
  id: string;
  title: string;
  about: string;
  language: string;
  tone: string;
  style: string;
  status: string;
  caption: string;
  image_prompt: string;
  image_url: string;
  error: string;
  fb_post_id: string;
  fb_url: string;
  autopost: boolean;
  active: boolean;
  schedule: string;
  time: string;
  weekday: number;
  monthday: number;
  schedule_label: string;
  due: boolean;
  created_at: string;
  posted_at: string;
  runs: PublicRun[];
};

export type PublicRun = {
  id: string;
  caption: string;
  status: string;
  error: string;
  fb_url: string;
  image_url: string;
  created_at: string;
  posted_at: string;
};

function imagePath(id: string) {
  return path.join(imageDir(), `${id}.img`);
}

function colombo(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  return { ymd, hm: `${get("hour")}:${get("minute")}`, day: Number(get("day")), weekday: weekdays[get("weekday")] || 1 };
}

function isoWeek(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function repeating(topic: Topic) {
  return ["daily", "weekly", "monthly"].includes(topic.schedule);
}

function slotFor(topic: Topic, now = colombo()) {
  if (topic.schedule === "daily") return now.ymd;
  if (topic.schedule === "weekly") return isoWeek(now.ymd);
  if (topic.schedule === "monthly") return now.ymd.slice(0, 7);
  return "";
}

function slot(topic: Topic) {
  return slotFor(topic);
}

function occurrenceInstant(topic: Topic, now = colombo()) {
  if (!repeating(topic) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(topic.time || "")) return null;
  const [hour, minute] = topic.time.split(":").map(Number);
  let ymd = now.ymd;
  if (topic.schedule === "weekly") {
    const [year, month, day] = now.ymd.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + (Number(topic.weekday || 1) - now.weekday));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    ymd = `${y}-${m}-${d}`;
  } else if (topic.schedule === "monthly") {
    ymd = `${now.ymd.slice(0, 7)}-${String(Number(topic.monthday || 1)).padStart(2, "0")}`;
  }
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - 5.5 * 60 * 60 * 1000);
}

function postedInSlot(topic: Topic, now = colombo()) {
  if (!topic.posted_at) return false;
  const when = new Date(topic.posted_at);
  if (Number.isNaN(when.getTime())) return false;
  return slotFor(topic, colombo(when)) === slotFor(topic, now);
}

function skipPassedSlot(topic: Topic) {
  topic.last_slot = slot(topic);
  if (topic.status !== "writing") {
    topic.status = "scheduled";
    topic.error = "";
    topic.attempts = 0;
    topic.fail_slot = "";
  }
}

function isDue(topic: Topic) {
  if (!repeating(topic) || topic.active === false) return false;
  const updated = Date.parse(topic.updated_at || "") || 0;
  if (topic.status === "writing" && Date.now() - updated < 240000) return false;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(topic.time || "")) return false;
  const now = colombo();
  if (now.hm < topic.time) return false;
  if (topic.schedule === "weekly" && now.weekday !== Number(topic.weekday || 0)) return false;
  if (topic.schedule === "monthly" && now.day !== Number(topic.monthday || 0)) return false;
  if ((topic.last_slot || "") === slot(topic)) return false;
  if (topic.status === "failed" && Number(topic.attempts || 0) >= 3 && (topic.fail_slot || "") === slot(topic)) return false;
  return ["scheduled", "queued", "ready", "failed", "posted"].includes(topic.status);
}

function scheduleLabel(topic: Topic) {
  if (topic.schedule === "daily") return `Daily at ${topic.time}`;
  if (topic.schedule === "weekly") {
    const days = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return `Weekly on ${days[Number(topic.weekday || 1)] || "Monday"} at ${topic.time}`;
  }
  if (topic.schedule === "monthly") return `Monthly on day ${Number(topic.monthday || 1)} at ${topic.time}`;
  return "Once";
}

function runStatus(topic: Topic) {
  if (topic.fb_url || topic.posted_at) return "posted";
  if (topic.status === "failed" || topic.error) return "failed";
  if (topic.status === "ready") return "ready";
  return "writing";
}

function copyImage(fromId: string, toId: string) {
  if (!fromId || !toId || fromId === toId) return;
  const from = imagePath(fromId);
  const to = imagePath(toId);
  if (!existsSync(from) || existsSync(to)) return;
  copyFileSync(from, to);
  if (existsSync(`${from}.type`)) copyFileSync(`${from}.type`, `${to}.type`);
}

function copyImageIfNewer(fromId: string, toId: string, since: string) {
  const from = imagePath(fromId);
  if (!existsSync(from) || existsSync(imagePath(toId))) return;
  const sinceMs = Date.parse(since) || 0;
  if (statSync(from).mtimeMs + 1000 < sinceMs) return;
  copyImage(fromId, toId);
}

function snapshotRun(topic: Topic): ScheduleRun {
  const id = randomId("pst");
  copyImage(topic.id, id);
  return {
    id,
    caption: topic.caption || "",
    status: runStatus(topic),
    error: topic.error || "",
    fb_post_id: topic.fb_post_id || "",
    fb_url: topic.fb_url || "",
    created_at: topic.updated_at || topic.created_at || new Date().toISOString(),
    posted_at: topic.posted_at || "",
  };
}

function startRun(topic: Topic) {
  if (!topic.runs) topic.runs = [];
  const alreadyKept = topic.runs.some((run) => run.caption && run.caption === (topic.caption || "") && (run.fb_url || "") === (topic.fb_url || ""));
  if (!alreadyKept && (topic.caption || topic.fb_url || topic.error)) topic.runs.unshift(snapshotRun(topic));
  topic.runs = topic.runs.filter((run) => run.caption || run.fb_url || run.error || run.status === "posted");
  const run: ScheduleRun = {
    id: randomId("pst"),
    caption: "",
    status: "writing",
    error: "",
    fb_post_id: "",
    fb_url: "",
    created_at: new Date().toISOString(),
    posted_at: "",
  };
  topic.runs.unshift(run);
  topic.current_run = run.id;
  topic.runs = topic.runs.slice(0, 40);
  topic.fb_url = "";
  topic.fb_post_id = "";
  topic.posted_at = "";
}

function syncRun(topic: Topic) {
  if (!repeating(topic)) return;
  if (!topic.runs) topic.runs = [];
  let run = topic.current_run ? topic.runs.find((item) => item.id === topic.current_run) : undefined;
  if (!run) {
    run = {
      id: randomId("pst"),
      caption: "",
      status: "writing",
      error: "",
      fb_post_id: "",
      fb_url: "",
      created_at: topic.updated_at || new Date().toISOString(),
      posted_at: "",
    };
    topic.runs.unshift(run);
    topic.current_run = run.id;
    topic.runs = topic.runs.slice(0, 40);
  }
  if (topic.caption) run.caption = topic.caption;
  run.error = topic.error || "";
  run.fb_post_id = topic.fb_post_id || run.fb_post_id;
  run.fb_url = topic.fb_url || run.fb_url;
  run.posted_at = topic.posted_at || run.posted_at;
  if (run.fb_url) run.status = "posted";
  else if (topic.status === "failed") run.status = "failed";
  else if (topic.status === "ready") run.status = "ready";
  else if (topic.status === "writing") run.status = "writing";
  else if (run.caption) run.status = "ready";
  copyImageIfNewer(topic.id, run.id, run.created_at);
}

function visibleRuns(topic: Topic): ScheduleRun[] {
  const runs = Array.isArray(topic.runs) ? topic.runs.filter((run) => run && typeof run.id === "string") : [];
  if (runs.length || !repeating(topic)) return runs;
  if (!topic.caption && !topic.error && !topic.fb_url && !topic.posted_at) return [];
  return [{
    id: topic.id,
    caption: topic.caption || "",
    status: runStatus(topic),
    error: topic.error || "",
    fb_post_id: topic.fb_post_id || "",
    fb_url: topic.fb_url || "",
    created_at: topic.updated_at || topic.created_at || "",
    posted_at: topic.posted_at || "",
  }];
}

function publicRuns(topic: Topic): PublicRun[] {
  return visibleRuns(topic).map((run) => ({
    id: run.id,
    caption: run.caption || "",
    status: run.status || "writing",
    error: publicError(run.error || ""),
    fb_url: run.fb_url || "",
    image_url: existsSync(imagePath(run.id)) ? `/api/image/${encodeURIComponent(run.id)}` : "",
    created_at: run.created_at || "",
    posted_at: run.posted_at || "",
  }));
}

export function publicTopic(topic: Topic): PublicTopic {
  const hasImage = !!topic.id && existsSync(imagePath(topic.id));
  return {
    id: topic.id,
    title: topic.title || "",
    about: topic.about || "",
    language: topic.language || "",
    tone: topic.tone || "",
    style: topic.style || "",
    status: topic.status || "queued",
    caption: topic.caption || "",
    image_prompt: topic.image_prompt || "",
    image_url: hasImage ? `/api/image/${encodeURIComponent(topic.id)}` : "",
    error: publicError(topic.error || ""),
    fb_post_id: topic.fb_post_id || "",
    fb_url: topic.fb_url || "",
    autopost: !!topic.autopost,
    active: topic.active !== false,
    schedule: topic.schedule || "once",
    time: topic.time || "",
    weekday: Number(topic.weekday || 1),
    monthday: Number(topic.monthday || 1),
    schedule_label: scheduleLabel(topic),
    due: isDue(topic),
    created_at: topic.created_at || "",
    posted_at: topic.posted_at || "",
    runs: publicRuns(topic),
  };
}

export async function publicState(request?: Request) {
  const settings = readSettings();
  const gemini = geminiKey();
  const pending = readPending().map((page) => ({ id: page.id, name: page.name }));
  const flash = await takeFlash();
  const topics = readTopics().map(publicTopic).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const origin = appOrigin(request);
  return {
    ok: true,
    gemini: {
      ready: gemini.key !== "",
    },
    facebook: {
      app_id: settings.fb_app_id,
      has_secret: settings.fb_app_secret !== "",
      page_id: settings.fb_page_id,
      page_name: settings.fb_page_name,
      connected: settings.fb_page_id !== "" && settings.fb_page_token !== "" && settings.fb_page_name !== "",
      redirect_uri: facebookRedirect(request),
    },
    page_voice: settings.page_voice,
    defaults: { language: settings.language, tone: settings.tone, style: settings.style },
    pending_pages: pending,
    cron_url: `${origin}/api/cron?key=${encodeURIComponent(settings.cron_key)}`,
    flash,
    topics,
  };
}

export async function saveConnection(input: Record<string, unknown>) {
  return transaction(async () => {
    const settings = readSettings();
    const secret = String(input.app_secret || "").trim();
    const token = String(input.page_token || "").trim();
    if (secret) settings.fb_app_secret = secret;
    if (token) settings.fb_page_token = token;
    settings.fb_app_id = String(input.app_id ?? settings.fb_app_id).trim();
    const pageId = String(input.page_id ?? settings.fb_page_id).trim();
    settings.fb_page_id = pageId.replace(/\D/g, "") || pageId;
    settings.page_voice = limitText(String(input.page_voice ?? settings.page_voice), 800);
    if (input.language) settings.language = limitText(String(input.language), 40);
    if (input.tone) settings.tone = limitText(String(input.tone), 40);
    if (input.style) settings.style = limitText(String(input.style), 40);
    if (settings.fb_page_id && settings.fb_page_token) {
      try {
        const page = await pageInfo(settings.fb_page_id, settings.fb_page_token);
        settings.fb_page_name = String(page.name || "Page");
        settings.fb_page_id = String(page.id || settings.fb_page_id);
      } catch (error) {
        settings.fb_page_name = "";
        saveSettings(settings);
        throw error;
      }
    }
    saveSettings(settings);
  });
}

export function disconnect() {
  return transaction(() => {
    const settings = readSettings();
    settings.fb_page_id = "";
    settings.fb_page_name = "";
    settings.fb_page_token = "";
    saveSettings(settings);
  });
}

export function rememberPage(page: { id: string; name: string; token: string }) {
  return transaction(() => {
    const settings = readSettings();
    settings.fb_page_id = page.id;
    settings.fb_page_name = page.name;
    settings.fb_page_token = page.token;
    saveSettings(settings);
    clearPending();
  });
}

function readScheduleInput(input: Record<string, unknown>) {
  const title = limitText(String(input.title || ""), 160);
  let about = String(input.about || "").trim();
  if (about.length > 2000) about = about.slice(0, 2000);
  if (title.length < 2) throw new DeskError("Add a title.");
  if (about.length < 2) throw new DeskError("Add a short description of what the post is about.");
  let schedule = String(input.schedule || "once");
  if (!["once", "daily", "weekly", "monthly"].includes(schedule)) schedule = "once";
  let time = String(input.time || "");
  if (time.length > 5) time = time.slice(0, 5);
  if (schedule !== "once" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new DeskError("Set a time for this repeat.");
  }
  return {
    title,
    about,
    language: limitText(String(input.language || "Sinhala"), 40),
    tone: limitText(String(input.tone || "Friendly"), 40),
    style: limitText(String(input.style || "Photograph"), 40),
    schedule,
    time: schedule === "once" ? "" : time,
    weekday: Math.max(1, Math.min(7, Number(input.weekday || 1))),
    monthday: Math.max(1, Math.min(28, Number(input.monthday || 1))),
  };
}

function retarget(topic: Topic) {
  const fire = occurrenceInstant(topic);
  if (fire && fire.getTime() <= Date.now()) {
    topic.last_slot = slot(topic);
    return;
  }
  if (!postedInSlot(topic)) topic.last_slot = "";
}

export async function addTopic(input: Record<string, unknown>, postNow: boolean) {
  const fields = readScheduleInput(input);
  const repeat = fields.schedule !== "once";
  const topic: Topic = {
    id: randomId("top"),
    ...fields,
    last_slot: "",
    fail_slot: "",
    autopost: !repeat && (postNow || !!input.autopost),
    active: true,
    paused_at: "",
    status: repeat ? "scheduled" : "queued",
    caption: "",
    image_prompt: "",
    error: "",
    fb_post_id: "",
    fb_url: "",
    attempts: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    posted_at: "",
  };
  await transaction(() => {
    const topics = readTopics();
    topics.unshift(topic);
    saveTopics(topics);
    const settings = readSettings();
    settings.language = topic.language;
    settings.tone = topic.tone;
    settings.style = topic.style;
    saveSettings(settings);
  });
  if (postNow && !repeat) return generate(topic.id, true);
  return publicTopic(findTopic(topic.id) || topic);
}

export function updateTopic(id: string, input: Record<string, unknown>) {
  const fields = readScheduleInput(input);
  return transaction(() => {
    const topics = readTopics();
    const topic = topics.find((item) => item.id === id);
    if (!topic) throw new DeskError("That schedule is no longer in the list.");
    if (!repeating(topic)) throw new DeskError("That topic is not a schedule.");
    if (topic.status === "writing") throw new DeskError("That schedule is being written. Try again in a moment.");
    const timingChanged =
      topic.schedule !== fields.schedule ||
      topic.time !== fields.time ||
      Number(topic.weekday || 1) !== fields.weekday ||
      Number(topic.monthday || 1) !== fields.monthday;
    topic.title = fields.title;
    topic.about = fields.about;
    topic.language = fields.language;
    topic.tone = fields.tone;
    topic.style = fields.style;
    topic.schedule = fields.schedule;
    topic.time = fields.time;
    topic.weekday = fields.weekday;
    topic.monthday = fields.monthday;
    topic.updated_at = new Date().toISOString();
    if (fields.schedule === "once") {
      topic.autopost = false;
      topic.active = true;
      topic.paused_at = "";
      topic.last_slot = "";
      topic.fail_slot = "";
      topic.status = "queued";
    } else if (timingChanged) {
      topic.fail_slot = "";
      topic.attempts = 0;
      retarget(topic);
    }
    saveTopics(topics);
    const settings = readSettings();
    settings.language = topic.language;
    settings.tone = topic.tone;
    settings.style = topic.style;
    saveSettings(settings);
    return publicTopic(topic);
  });
}

export function setTopicActive(id: string, active: boolean) {
  return transaction(() => {
    const topics = readTopics();
    const topic = topics.find((item) => item.id === id);
    if (!topic) throw new DeskError("That schedule is no longer in the list.");
    if (!repeating(topic)) throw new DeskError("That topic is not a schedule.");
    if (!active) {
      if (topic.active !== false) topic.paused_at = new Date().toISOString();
      topic.active = false;
    } else {
      const pausedAt = Date.parse(topic.paused_at || "");
      const fire = occurrenceInstant(topic);
      const passedDuringPause = !!fire && fire.getTime() <= Date.now() && (Number.isNaN(pausedAt) || fire.getTime() >= pausedAt);
      if (passedDuringPause) skipPassedSlot(topic);
      topic.active = true;
      topic.paused_at = "";
    }
    topic.updated_at = new Date().toISOString();
    saveTopics(topics);
    return publicTopic(topic);
  });
}

export function updateCaption(id: string, captionInput: string) {
  let caption = captionInput.trim();
  if (caption.length < 2) throw new DeskError("The caption is empty.");
  if (caption.length > 6000) caption = caption.slice(0, 6000);
  return transaction(() => {
    const topics = readTopics();
    const topic = topics.find((item) => item.id === id);
    if (!topic) throw new DeskError("That topic is no longer in the queue.");
    if (topic.status === "posted") throw new DeskError("That post is already on the page.");
    topic.caption = caption;
    topic.updated_at = new Date().toISOString();
    saveTopics(topics);
    return publicTopic(topic);
  });
}

export function deleteTopic(id: string) {
  return transaction(() => {
    const topics = readTopics();
    const topic = topics.find((item) => item.id === id);
    const ids = [id, ...(topic?.runs || []).map((run) => run.id)];
    saveTopics(topics.filter((item) => item.id !== id));
    for (const imageId of ids) {
      const file = imagePath(imageId);
      if (existsSync(file)) unlinkSync(file);
      if (existsSync(`${file}.type`)) unlinkSync(`${file}.type`);
    }
  });
}

function claim(id: string, automatic = false) {
  const topics = readTopics();
  const topic = topics.find((item) => item.id === id);
  if (!topic) throw new DeskError("That topic is no longer in the queue.");
  if (automatic && repeating(topic) && topic.active === false) throw new DeskError("That schedule is paused.");
  if (topic.status === "posted" && !repeating(topic)) throw new DeskError("That post is already on the page.");
  if (repeating(topic) && (topic.fail_slot || "") !== slot(topic)) topic.attempts = 0;
  const updated = Date.parse(topic.updated_at || "") || 0;
  if (topic.status === "writing" && Date.now() - updated < 240000) {
    throw new DeskError("That topic is already being written.");
  }
  if (repeating(topic)) startRun(topic);
  topic.status = "writing";
  topic.error = "";
  topic.updated_at = new Date().toISOString();
  saveTopics(topics);
  return topic;
}

function patch(id: string, changes: Partial<Topic>) {
  const topics = readTopics();
  const topic = topics.find((item) => item.id === id);
  if (!topic) throw new DeskError("That topic is no longer in the queue.");
  Object.assign(topic, changes);
  syncRun(topic);
  saveTopics(topics);
  return publicTopic(topic);
}

function fail(id: string, error: string) {
  return transaction(() => {
    const topics = readTopics();
    const topic = topics.find((item) => item.id === id);
    if (!topic) return;
    topic.status = "failed";
    topic.error = error;
    topic.attempts = Number(topic.attempts || 0) + 1;
    if (repeating(topic)) topic.fail_slot = slot(topic);
    topic.updated_at = new Date().toISOString();
    syncRun(topic);
    saveTopics(topics);
  });
}

async function stopIfPaused(id: string) {
  return transaction(() => {
    const topics = readTopics();
    const topic = topics.find((item) => item.id === id);
    if (!topic || !repeating(topic) || topic.active !== false) return false;
    topic.status = "scheduled";
    topic.error = "";
    topic.updated_at = new Date().toISOString();
    syncRun(topic);
    saveTopics(topics);
    return true;
  });
}

export async function generate(id: string, publishAfter: boolean, automatic = false) {
  const claimed = await transaction(() => claim(id, automatic));
  const gemini = geminiKey();
  if (!gemini.key) {
    await fail(id, "Writing is not available right now.");
    throw new DeskError("Writing is not available right now.");
  }
  let saved: PublicTopic;
  try {
    if (automatic && (await stopIfPaused(id))) return publicTopic(findTopic(id) || claimed);
    const settings = readSettings();
    const written = await writePost(gemini.key, claimed, settings.page_voice);
    await transaction(() =>
      patch(id, {
        caption: written.caption,
        image_prompt: written.image_prompt,
        status: "writing",
        updated_at: new Date().toISOString(),
      })
    );
    if (automatic && (await stopIfPaused(id))) return publicTopic(findTopic(id) || claimed);
    const image = await makeImage(gemini.key, written.image_prompt, claimed.style);
    writeFileSync(imagePath(id), image.bytes);
    writeFileSync(`${imagePath(id)}.type`, image.mime);
    saved = await transaction(() =>
      patch(id, {
        caption: written.caption,
        image_prompt: written.image_prompt,
        status: "ready",
        error: "",
        updated_at: new Date().toISOString(),
      })
    );
  } catch (error) {
    const message = publicError(error instanceof Error ? error.message : "The post could not be written.");
    await fail(id, message);
    throw new DeskError(message, error instanceof DeskError ? error.status : 502);
  }
  if (publishAfter) {
    if (automatic && (await stopIfPaused(id))) return publicTopic(findTopic(id) || claimed);
    return publish(id);
  }
  return saved;
}

export async function publish(id: string) {
  const topic = findTopic(id);
  if (!topic) throw new DeskError("That topic is no longer in the queue.");
  if (topic.status === "posted" && !repeating(topic)) return publicTopic(topic);
  const caption = (topic.caption || "").trim();
  if (!caption) throw new DeskError("Write the post before publishing it.");
  const settings = readSettings();
  if (!settings.fb_page_id || !settings.fb_page_token) throw new DeskError("Connect a Facebook page before posting.");
  const file = imagePath(id);
  if (!existsSync(file)) throw new DeskError("The picture is not ready yet. Write the post again.");
  const mime = existsSync(`${file}.type`) ? readFileSync(`${file}.type`, "utf8").trim() : "image/png";
  let posted: { id: string; url: string };
  try {
    posted = await publishPhoto(settings.fb_page_id, settings.fb_page_token, caption, file, mime);
  } catch (error) {
    const message = publicError(error instanceof Error ? error.message : "Facebook refused the post.");
    await fail(id, message);
    throw new DeskError(message, error instanceof DeskError ? error.status : 502);
  }
  return transaction(() => {
    const current = findTopic(id);
    const again = !!current && repeating(current);
    return patch(id, {
      status: again ? "scheduled" : "posted",
      error: "",
      attempts: 0,
      fb_post_id: posted.id,
      fb_url: posted.url,
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_slot: again && current && isDue(current) ? slot(current) : current?.last_slot || "",
    });
  });
}

export async function runDue() {
  const picked = await transaction(() => {
    const topic = readTopics().find((item) => isDue(item));
    return topic ? { id: topic.id, posted_at: topic.posted_at || "" } : null;
  });
  if (!picked) return { ran: false, topic: null };
  try {
    const topic = await generate(picked.id, true, true);
    const posted = (topic.posted_at || "") !== "" && topic.posted_at !== picked.posted_at;
    return { ran: posted, paused: !posted && topic.active === false, topic };
  } catch (error) {
    if (error instanceof DeskError && error.message === "That schedule is paused.") {
      const topic = findTopic(picked.id);
      return { ran: false, paused: true, topic: topic ? publicTopic(topic) : null };
    }
    throw error;
  }
}

export async function runNext() {
  const id = await transaction(() => {
    const now = Date.now();
    for (const topic of readTopics()) {
      if (!topic.autopost) continue;
      const updated = Date.parse(topic.updated_at || "") || 0;
      const stale = topic.status === "writing" && now - updated > 240000;
      const attempts = Number(topic.attempts || 0);
      if (topic.status === "queued" || topic.status === "ready" || (topic.status === "failed" && attempts < 3) || stale) {
        return topic.id;
      }
    }
    return "";
  });
  if (!id) return { ran: false, paused: false, topic: null };
  const topic = findTopic(id);
  const caption = (topic?.caption || "").trim();
  const hasImage = existsSync(imagePath(id));
  const ready = !!topic && (topic.status === "ready" || topic.status === "failed") && caption && hasImage;
  return { ran: true, paused: false, topic: ready ? await publish(id) : await generate(id, true) };
}

export async function startFacebook(request: Request) {
  const settings = readSettings();
  if (!settings.fb_app_id || !settings.fb_app_secret) {
    throw new DeskError("Save the Meta app ID and app secret first.");
  }
  const state = randomId("oauth").replace("oauth_", "");
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", settings.fb_app_id);
  url.searchParams.set("redirect_uri", facebookRedirect(request));
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "business_management,pages_show_list,pages_manage_posts,pages_read_engagement");
  url.searchParams.set("response_type", "code");
  return { state, url: url.toString() };
}

export async function finishFacebook(code: string, redirectUri: string) {
  const settings = readSettings();
  const token = await exchangeCode(settings.fb_app_id, settings.fb_app_secret, code, redirectUri);
  const pages = await listPages(token);
  if (!pages.length) throw new DeskError("Facebook did not list a page for this login. Use an account that manages the page.");
  if (pages.length === 1) {
    await rememberPage(pages[0]);
    return `Connected to ${pages[0].name}.`;
  }
  await transaction(() => savePending(pages));
  return "Choose the page this desk should publish to.";
}

export function pickPage(pageId: string) {
  const chosen = readPending().find((page) => page.id === pageId);
  if (!chosen) throw new DeskError("Choose a page from the list Facebook just returned.");
  return rememberPage(chosen);
}

export function topicImage(id: string) {
  const postImage = /^pst_[a-f0-9]{12}$/.test(id);
  const topicImageId = /^top_[a-f0-9]{12}$/.test(id);
  if (!postImage && !topicImageId) return null;
  if (topicImageId && !findTopic(id)) return null;
  if (postImage && !readTopics().some((topic) => (topic.runs || []).some((run) => run.id === id))) return null;
  const file = imagePath(id);
  if (!existsSync(file)) return null;
  const mime = existsSync(`${file}.type`) ? readFileSync(`${file}.type`, "utf8").trim() : "image/png";
  return { file, mime: mime.startsWith("image/") ? mime : "image/png" };
}
