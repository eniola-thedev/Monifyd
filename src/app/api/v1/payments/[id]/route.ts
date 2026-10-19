import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { authenticate } from "@/lib/api/auth";
import { apiAuthError, apiError } from "@/lib/api/errors";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticate(req);
  const authError = apiAuthError(ctx);
  if (authError) return authError;
  if (!ctx) return apiError("INVALID_API_KEY", "Missing or invalid API key.", 401);
  const { id } = await params;
  const { data } = await adminClient().from("payments").select("*").eq("id", id).eq("merchant_id", ctx.merchantId).eq("livemode", ctx.mode === "live").maybeSingle();
  if (!data) return apiError("PAYMENT_NOT_FOUND", "No payment with that ID.", 404);
  return NextResponse.json(data);
}
