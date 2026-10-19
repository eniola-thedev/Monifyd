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
  const { data, error } = await adminClient().from("invoices").select("*")
    .eq("id", id).eq("merchant_id", ctx.merchantId).eq("livemode", ctx.mode === "live").maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", "Could not load the invoice.", 500);
  if (!data) return apiError("INVOICE_NOT_FOUND", "No invoice with that ID.", 404);
  return NextResponse.json({ ...data, checkout_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/pay/${id}` });
}
