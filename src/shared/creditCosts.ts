export const ACTION_COSTS = {
  post: 5,
  video: 80,
  audio: 2,
} as const;

export type CreditAction = keyof typeof ACTION_COSTS;

export function actionCost(action: CreditAction) {
  return ACTION_COSTS[action];
}

export function creditLabel(amount: number) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${n} credit${n === 1 ? "" : "s"}`;
}
