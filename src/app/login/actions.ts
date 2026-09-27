"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_NAME, createSessionToken, passwordMatches, sessionCookieOptions } from "@/lib/auth";

export type LoginState = { error?: string };

// Anything not starting with a single "/" is rejected: "//evil.com" and
// "https://evil.com" are both absolute URLs that would turn the login form
// into an open redirect after a successful login.
function safeRedirect(target: FormDataEntryValue | null): string {
  const value = typeof target === "string" ? target : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";

  if (!passwordMatches(password)) {
    // The comparison itself is constant-time, so this delay is purely to blunt
    // online guessing: without it a fast machine can try thousands of
    // candidates per second, and a 30-day session makes brute force worth it.
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Deliberately does not distinguish "wrong password" from "auth not
    // configured" — telling the user which one it is would confirm whether
    // this instance is even set up.
    return { error: "Contraseña incorrecta." };
  }

  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(), sessionCookieOptions());

  redirect(safeRedirect(formData.get("next")));
}
