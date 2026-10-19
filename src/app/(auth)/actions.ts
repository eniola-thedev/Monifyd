"use server";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { fail } from "@/lib/flash";
import { appUrl } from "@/lib/format";
import { safeInternalPath } from "@/lib/navigation";

export type OtpResult = { ok: true } | { ok: false; error: string };

/** Sends a short email code for an existing account or a new signup. */
export async function sendEmailOtp(mode: "login" | "signup", emailValue: string, business = ""): Promise<OtpResult> {
  const email = emailValue.trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: mode === "signup",
      ...(mode === "signup" ? { data: { business_name: business.trim().slice(0, 120) || null } } : {}),
    },
  });
  if (error) return { ok: false, error: "We couldn't send a sign-in code. Check the email address and try again." };
  return { ok: true };
}

/** Verifies the email code and creates the authenticated Supabase session. */
export async function verifyEmailOtp(emailValue: string, tokenValue: string, business: string, nextValue: string): Promise<OtpResult> {
  const email = emailValue.trim().toLowerCase();
  const token = tokenValue.trim();
  if (!/^\d{6}$/.test(token)) return { ok: false, error: "Enter the six-digit code from your email." };
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) return { ok: false, error: "That code is invalid or expired. Request a new code and try again." };
  if (business.trim()) {
    const { error: profileError } = await supabase.from("profiles").update({ business_name: business.trim().slice(0, 120) }).eq("id", data.user.id);
    if (profileError) return { ok: false, error: "Your email is verified, but we couldn't save your business name. Continue and update it in Settings." };
  }
  redirect(safeInternalPath(nextValue));
}

export async function login(fd: FormData) {
  const next = safeInternalPath(String(fd.get("next") ?? ""));
  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get("email") ?? "").trim(),
    password: String(fd.get("password") ?? ""),
  });
  if (error) fail("/login", "Email or password is incorrect.");
  redirect(next);
}

export async function signup(fd: FormData) {
  const next = safeInternalPath(String(fd.get("next") ?? ""));
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const business = String(fd.get("business") ?? "").trim();
  if (password.length < 8) fail("/signup", "Choose a password with at least 8 characters.");
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      data: { business_name: business || null },
    },
  });
  if (error) fail("/signup", error.message);
  if (data.session && data.user) {
    await supabase.from("profiles").update({ business_name: business || null }).eq("id", data.user.id);
    redirect(next);
  }
  redirect("/signup/verify-email");
}

/** Starts Google sign-in. Works for both new and returning users. */
export async function signInWithGoogle(fd: FormData) {
  const next = safeInternalPath(String(fd.get("next") ?? ""));
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) fail("/login", "Google sign-in is not available right now. Please try again.");
  redirect(data.url);
}

export async function logout() {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Ends this session and every other session for the account. */
export async function logoutEverywhere() {
  const supabase = await serverClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?message=" + encodeURIComponent("You were signed out on all devices."));
}
