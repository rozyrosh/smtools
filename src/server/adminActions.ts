"use server";

import { revalidatePath } from "next/cache";
import { changeUserPlan, clearUserUsage, deleteUser, saveUserControl, setUserPaused, setUserSchedules } from "./admin";
import { DeskError } from "./paths";

function message(error: unknown) {
  return error instanceof DeskError ? error.message : "That change could not be saved.";
}

async function done(work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    return message(error);
  }
  revalidatePath("/admin");
  return "";
}

export async function saveUserAction(
  id: string,
  input: { name: string; email: string; password: string; admin: boolean; disabled: boolean; plan?: string }
) {
  return done(() => saveUserControl(id, input));
}

export async function setPlanAction(id: string, plan: string, resetUsage = false) {
  return done(() => changeUserPlan(id, plan, resetUsage));
}

export async function resetUsageAction(id: string) {
  return done(() => clearUserUsage(id));
}

export async function pauseAccountAction(id: string, paused: boolean) {
  return done(() => setUserPaused(id, paused));
}

export async function removeAccountAction(id: string) {
  return done(() => deleteUser(id));
}

export async function schedulesAction(id: string, active: boolean) {
  return done(() => setUserSchedules(id, active));
}
