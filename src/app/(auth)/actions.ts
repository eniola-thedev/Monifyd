"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { fail } from "@/lib/flash";
import { appUrl } from "@/lib/format";
import { safeInternalPath } from "@/lib/navigation";
import { isDisposableEmail } from "@/lib/auth/disposable-email";
import { getClientIp, hashLoginLimitKey } from "@/lib/auth/login-security";

export async function login(fd: FormData) {
  const next = safeInternalPath(String(fd.get("next") ?? ""));
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const clientIp = getClientIp(await headers());
  if (!clientIp) fail("/login", "Sign-in is temporarily unavailable. Please try again later.");

  const hashSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hashSecret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for login rate limiting");
  const ipKey = hashLoginLimitKey("ip", clientIp, hashSecret);
  const emailKey = hashLoginLimitKey("email", email.toLowerCase(), hashSecret);
  const security = adminClient();

  const { data: ipResult, error: ipError } = await security.rpc("consume_login_ip_limit", {
    p_key_hash: ipKey,
    p_limit: 30,
    p_window_seconds: 900,
  });
  if (ipError) throw new Error(`Could not enforce login IP rate limit: ${ipError.message}`);
  const ipLimit = Array.isArray(ipResult) ? ipResult[0] : ipResult;
  if (!ipLimit) throw new Error("Login IP rate limit returned no result");
  if (!ipLimit.allowed) {
    const waitMinutes = Math.max(1, Math.ceil(Number(ipLimit.retry_after) / 60));
    fail("/login", `Too many sign-in attempts from this network. Try again in about ${waitMinutes} minute${waitMinutes === 1 ? "" : "s"}.`);
  }

  const { data: lockResult, error: lockError } = await security.rpc("check_login_account_lock", {
    p_key_hash: emailKey,
  });
  if (lockError) throw new Error(`Could not check login account lock: ${lockError.message}`);
  const accountLock = Array.isArray(lockResult) ? lockResult[0] : lockResult;
  if (!accountLock) throw new Error("Login account lock check returned no result");
  if (accountLock.locked) fail("/login", "Email or password is incorrect.");

  const supabase = await serverClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    if (signInError.status === 400) {
      const { error } = await security.rpc("record_login_failure", {
        p_key_hash: emailKey,
        p_failure_limit: 5,
        p_window_seconds: 900,
        p_lock_seconds: 900,
      });
      if (error) throw new Error(`Could not record failed login attempt: ${error.message}`);
    }
    fail("/login", "Email or password is incorrect.");
  }
  const { error: clearError } = await security.rpc("clear_login_failures", { p_key_hash: emailKey });
  if (clearError) throw new Error(`Could not clear login failures after successful sign-in: ${clearError.message}`);
  redirect(next);
}

export async function signup(fd: FormData) {
  const next = safeInternalPath(String(fd.get("next") ?? ""));
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const confirmPassword = String(fd.get("confirmPassword") ?? "");
  const business = String(fd.get("business") ?? "").trim();
  if (isDisposableEmail(email)) fail("/signup", "Use a non-disposable email address to create your account.");
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
