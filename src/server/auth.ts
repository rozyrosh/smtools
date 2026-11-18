"use server";

import { redirect } from "next/navigation";
import { login, logout, register } from "@/server/accounts";
import { DeskError } from "@/server/paths";

export async function loginAction(formData: FormData) {
  try {
    await login(String(formData.get("email") || ""), String(formData.get("password") || ""));
  } catch (error) {
    const message = error instanceof DeskError ? error.message : "That email or password does not match.";
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }
  redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
  try {
    await register(String(formData.get("name") || ""), String(formData.get("email") || ""), String(formData.get("password") || ""));
  } catch (error) {
    const message = error instanceof DeskError ? error.message : "The account could not be opened.";
    redirect(`/register?error=${encodeURIComponent(message)}&name=${encodeURIComponent(String(formData.get("name") || ""))}&email=${encodeURIComponent(String(formData.get("email") || ""))}`);
  }
  redirect("/dashboard");
}

export async function logoutAction() {
  await logout();
  redirect("/");
}
