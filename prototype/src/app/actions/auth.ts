"use server";

import { redirect } from "next/navigation";
import { authenticateAccount, registerAccount } from "@/lib/auth/accounts";
import { createSession, destroySession } from "@/lib/auth/session";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function registerAction(formData: FormData) {
  let message: string | null = null;
  try {
    const user = await registerAccount({
      username: value(formData, "username"),
      email: value(formData, "email"),
      displayName: value(formData, "displayName"),
      password: value(formData, "password"),
    });
    await createSession(user.id);
  } catch (error) {
    message = error instanceof Error ? error.message : "Could not create the account.";
  }
  if (message) redirect(`/login?error=${encodeURIComponent(message)}`);
  redirect("/?notice=Your%20account%20is%20ready.");
}

export async function loginAction(formData: FormData) {
  let message: string | null = null;
  try {
    const user = await authenticateAccount(value(formData, "username"), value(formData, "password"));
    await createSession(user.id);
  } catch (error) {
    message = error instanceof Error ? error.message : "Could not sign in.";
  }
  if (message) redirect(`/login?error=${encodeURIComponent(message)}`);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login?notice=You%20have%20signed%20out.");
}
