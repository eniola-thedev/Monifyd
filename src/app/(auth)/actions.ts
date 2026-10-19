"use server";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { fail } from "@/lib/flash";
import { appUrl } from "@/lib/format";
import { safeInternalPath } from "@/lib/navigation";

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
  const confirmPassword = String(fd.get("confirmPassword") ?? "");
  const business = String(fd.get("business") ?? "").trim();
  if (password.length < 8) fail("/signup", "Choose a password with at least 8 characters.");
  if (password !== confirmPassword) fail("/signup", "Passwords do not match.");
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
