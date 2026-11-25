import { DeskError } from "./paths";
import { ACTION_COSTS, type CreditAction } from "@/shared/creditCosts";

export const PLAN_IDS = ["free", "basic", "pro", "business"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type CreditKind = CreditAction;

export type PlanFeatures = {
  posts: boolean;
  videos: boolean;
  audios: boolean;
};

export type PlanDefinition = {
  id: PlanId;
  name: string;
  priceUsd: number;
  who: string;
  credits: number;
  features: PlanFeatures;
  popular?: boolean;
};

export type PlanUsage = {
  period: string;
  spent: number;
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceUsd: 0,
    who: "Try the desk with a starter credit balance",
    credits: 19,
    features: { posts: true, videos: false, audios: true },
  },
  basic: {
    id: "basic",
    name: "Basic",
    priceUsd: 9,
    who: "For individuals getting started",
    credits: 360,
    features: { posts: true, videos: true, audios: true },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsd: 19,
    who: "For growing businesses",
    credits: 780,
    features: { posts: true, videos: true, audios: true },
    popular: true,
  },
  business: {
    id: "business",
    name: "Business",
    priceUsd: 39,
    who: "For teams with heavier monthly use",
    credits: 1560,
    features: { posts: true, videos: true, audios: true },
  },
};

export function planList() {
  return PLAN_IDS.map((id) => PLANS[id]);
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function normalizePlanId(value: unknown): PlanId {
  return isPlanId(value) ? value : "free";
}

export function currentPeriod(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function emptyUsage(period = currentPeriod()): PlanUsage {
  return { period, spent: 0 };
}

export function normalizeUsage(raw: unknown, period = currentPeriod()): PlanUsage {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const savedPeriod = String(row.period || "");
  if (savedPeriod !== period) return emptyUsage(period);
  if (typeof row.spent === "number" || typeof row.spent === "string") {
    return { period, spent: Math.max(0, Math.floor(Number(row.spent) || 0)) };
  }
  // Migrate older per-tool counters into one spent total.
  const posts = Math.max(0, Math.floor(Number(row.posts) || 0));
  const videos = Math.max(0, Math.floor(Number(row.videos) || 0));
  const audios = Math.max(0, Math.floor(Number(row.audios) || 0));
  return {
    period,
    spent: posts * ACTION_COSTS.post + videos * ACTION_COSTS.video + audios * ACTION_COSTS.audio,
  };
}

export function planCredits(planId: PlanId) {
  return PLANS[planId].credits;
}

export function remainingBalance(planId: PlanId, usage: PlanUsage) {
  return Math.max(0, planCredits(planId) - usage.spent);
}

export function featureEnabled(planId: PlanId, action: CreditAction) {
  const key = action === "post" ? "posts" : action === "video" ? "videos" : "audios";
  return PLANS[planId].features[key];
}

export function assertCredit(planId: PlanId, usage: PlanUsage, action: CreditAction) {
  const plan = PLANS[planId];
  if (!featureEnabled(planId, action)) {
    const label = action === "post" ? "post generation" : action === "video" ? "video generation" : "audio generation";
    throw new DeskError(`${plan.name} does not include ${label}. Ask an admin to upgrade your plan.`, 402);
  }
  const cost = ACTION_COSTS[action];
  const left = remainingBalance(planId, usage);
  if (left < cost) {
    throw new DeskError(
      `Not enough credits for this ${action}. Needs ${cost}, you have ${left} left this month. Ask an admin to upgrade your plan.`,
      402,
    );
  }
}

export function priceLabel(plan: PlanDefinition) {
  if (plan.priceUsd <= 0) return "$0";
  return `$${plan.priceUsd}`;
}

export { ACTION_COSTS };
