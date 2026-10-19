import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { authenticate } from "@/lib/api/auth";
import { apiAuthError, apiError } from "@/lib/api/errors";
import { emitEvent } from "@/lib/webhooks/emit";
import { invoiceData } from "@/lib/webhooks/payload";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticate(req);
  const authError = apiAuthError(ctx);
  if (authError) return authError;
  if (!ctx) return apiError("INVALID_API_KEY", "Missing or invalid API key.", 401);
  const { id } = await params;
  const db = adminClient();
  const { data, error } = await db.from("invoices").update({ status: "CANCELLED", updated_at: new Date().toISOString() })
    .eq("id", id).eq("merchant_id", ctx.merchantId).eq("livemode", ctx.mode === "live")
    .in("status", ["DRAFT", "SENT", "AWAITING_PAYMENT"]).select("*").maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", "Could not cancel the invoice.", 500);
  if (!data) {
    const { data: existing, error: lookupError } = await db.from("invoices").select("id")
      .eq("id", id).eq("merchant_id", ctx.merchantId).eq("livemode", ctx.mode === "live").maybeSingle();
    if (lookupError) return apiError("INTERNAL_ERROR", "Could not load the invoice.", 500);
    if (!existing) return apiError("INVOICE_NOT_FOUND", "No invoice with that ID.", 404);
    return apiError("VALIDATION_ERROR", "This invoice can no longer be cancelled.", 409);
  }
  await emitEvent(ctx.merchantId, "invoice.cancelled", invoiceData(data));
  return NextResponse.json(data);
}
