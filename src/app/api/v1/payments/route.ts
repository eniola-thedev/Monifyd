import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { authenticate } from "@/lib/api/auth";
import { apiAuthError, apiError } from "@/lib/api/errors";

export async function GET(req: Request) {
  const ctx = await authenticate(req);
  const authError = apiAuthError(ctx);
  if (authError) return authError;
  if (!ctx) return apiError("INVALID_API_KEY", "Missing or invalid API key.", 401);
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.min(100_000, Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0));
  const status = url.searchParams.get("status");
  let query = adminClient()
    .from("payments")
    .select("id,status,amount_cents,fee_cents,total_cents,currency,asset,network,crypto_amount,payment_link_id,invoice_id,created_at,confirmed_at")
    .eq("merchant_id", ctx.merchantId).eq("livemode", ctx.mode === "live")
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (status && ["AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING", "PAID", "UNDERPAID", "OVERPAID", "EXPIRED", "FAILED", "CANCELLED"].includes(status)) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) return apiError("INTERNAL_ERROR", "Could not load payments.", 500);
  return NextResponse.json({ data });
}
