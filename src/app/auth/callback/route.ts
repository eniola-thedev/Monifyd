import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/format";
import { safeInternalPath } from "@/lib/navigation";

/** Supabase sends OAuth and verified-email links here with a one-time code. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeInternalPath(url.searchParams.get("next"));
  if (code) {
    const supabase = await serverClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      const businessName = user?.user_metadata?.business_name;
      if (user && typeof businessName === "string") {
        await supabase.from("profiles").update({ business_name: businessName || null }).eq("id", user.id);
      }
      return NextResponse.redirect(new URL(next, appUrl()));
    }
  }
  const errorDescription = url.searchParams.get("error_description");
  const message = errorDescription
    ? "That confirmation link is invalid or has expired. Request a new sign-up email and try again."
    : "Sign-in or email confirmation did not complete. Please try again.";
  return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent(message), appUrl()));
}
