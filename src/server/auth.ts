"use server";

import { redirect } from "next/navigation";
import { changeName, changePassword, login, logout, register } from "@/server/accounts";
import { DeskError } from "@/server/paths";

export async function loginAction(formData: FormData) {
  let admin = false;
  try {
    admin = (await login(String(formData.get("email") || ""), String(formData.get("password") || ""))).admin;
  } catch (error) {
    const message = error instanceof DeskError ? error.message : "That email or password does not match.";
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }
  redirect(admin ? "/admin" : "/dashboard");
}

export async function registerAction(formData: FormData) {
  let admin = false;
  try {
    admin = (await register(String(formData.get("name") || ""), String(formData.get("email") || ""), String(formData.get("password") || ""))).admin;
  } catch (error) {
    const message = error instanceof DeskError ? error.message : "The account could not be opened.";
    redirect(`/register?error=${encodeURIComponent(message)}&name=${encodeURIComponent(String(formData.get("name") || ""))}&email=${encodeURIComponent(String(formData.get("email") || ""))}`);
  }
  redirect(admin ? "/admin" : "/dashboard");
}

export async function changeNameAction(formData: FormData) {
  try {
    await changeName(String(formData.get("name") || ""));
  } catch (error) {
    const message = error instanceof DeskError ? error.message : "The name could not be saved.";
    redirect(`/profile?name_error=${encodeURIComponent(message)}`);
  }
  redirect("/profile?name_saved=1");
}

export async function changePasswordAction(formData: FormData) {
  const next = String(formData.get("next") || "");
  const confirm = String(formData.get("confirm") || "");
  if (next !== confirm) redirect(`/profile?error=${encodeURIComponent("The new passwords do not match.")}`);
  try {
    await changePassword(String(formData.get("current") || ""), next);
  } catch (error) {
    const message = error instanceof DeskError ? error.message : "The password could not be saved.";
    redirect(`/profile?error=${encodeURIComponent(message)}`);
  }
  redirect("/profile?saved=1");
}

export async function logoutAction() {
  await logout();
  redirect("/");
}
