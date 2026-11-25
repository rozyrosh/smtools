import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { listAccounts, removeAccount, requireAdmin, resetAccountUsage, setAccountDisabled, setAccountPlan, updateAccount } from "./accounts";
import { setTopicActive } from "./desk";
import { dataDir, DeskError, videoDir } from "./paths";
import { PLANS, type PlanId, type PlanUsage } from "./plans";
import { readTopics, runAs, type Topic } from "./store";

export type AdminTopic = {
  id: string;
  title: string;
  schedule: string;
  status: string;
  active: boolean;
  page: string;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  admin: boolean;
  disabled: boolean;
  created_at: string;
  page: string;
  connected: boolean;
  posts: number;
  schedules: number;
  topics: AdminTopic[];
  plan: PlanId;
  usage: PlanUsage;
  planName: string;
};

function deskFile(userId: string, name: string) {
  return path.join(dataDir(), "desks", userId, `${name}.json`);
}

function readDesk<T>(userId: string, name: string, fallback: T): T {
  const file = deskFile(userId, name);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function topicRow(topic: Topic): AdminTopic {
  return {
    id: topic.id,
    title: topic.title || "Untitled",
    schedule: topic.schedule || "once",
    status: topic.status || "",
    active: topic.active !== false,
    page: topic.fb_url || "",
  };
}

export async function adminOverview() {
  const me = await requireAdmin();
  const users: AdminUser[] = [];
  for (const account of listAccounts()) {
    const settings = readDesk<Partial<{ fb_page_name: string; fb_page_token: string }>>(account.id, "settings", {});
    const topics = readDesk<Topic[]>(account.id, "topics", []).filter((item) => item && typeof item === "object");
    users.push({
      ...account,
      page: settings.fb_page_name || "",
      connected: !!settings.fb_page_token,
      posts: topics.filter((item) => item.status === "posted").length,
      schedules: topics.filter((item) => item.schedule && item.schedule !== "once").length,
      topics: topics.map(topicRow),
      planName: PLANS[account.plan].name,
    });
  }
  users.sort((a, b) => a.created_at.localeCompare(b.created_at));
  let videos = 0;
  const videosRoot = videoDir();
  if (existsSync(videosRoot)) {
    videos = readdirSync(videosRoot).filter((name) => name.endsWith(".mp4")).length;
  }
  return {
    me: me.id,
    name: me.name,
    videos,
    users,
    plans: Object.values(PLANS),
    posts: users.reduce((sum, user) => sum + user.posts, 0),
    schedules: users.reduce((sum, user) => sum + user.schedules, 0),
    connected: users.filter((user) => user.connected).length,
  };
}

function assertUser(id: string) {
  if (!/^usr_[a-f0-9]{12}$/.test(id)) throw new DeskError("That account is not valid.");
}

export async function saveUserControl(
  id: string,
  input: { name: string; email: string; password: string; admin: boolean; disabled: boolean; plan?: string }
) {
  const me = await requireAdmin();
  assertUser(id);
  updateAccount(id, input, me.id);
}

export async function changeUserPlan(id: string, plan: string, resetUsage = false) {
  await requireAdmin();
  assertUser(id);
  setAccountPlan(id, plan, resetUsage);
}

export async function clearUserUsage(id: string) {
  await requireAdmin();
  assertUser(id);
  resetAccountUsage(id);
}

export async function setUserPaused(id: string, paused: boolean) {
  const me = await requireAdmin();
  assertUser(id);
  if (id === me.id && paused) throw new DeskError("Your own admin sign-in stays open.");
  setAccountDisabled(id, paused);
}

export async function deleteUser(id: string) {
  const me = await requireAdmin();
  assertUser(id);
  if (id === me.id) throw new DeskError("You cannot remove the account you are using.");
  removeAccount(id);
}

export async function setUserSchedules(id: string, active: boolean) {
  await requireAdmin();
  assertUser(id);
  await runAs(id, async () => {
    const topics = readTopics().filter((topic) => topic.schedule && topic.schedule !== "once");
    for (const topic of topics) await setTopicActive(topic.id, active);
  });
}
