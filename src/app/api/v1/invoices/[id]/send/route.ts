import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { authenticate } from "@/lib/api/auth";
import { apiAuthError, apiError } from "@/lib/api/errors";
import { sendInvoiceEmail } from "@/lib/invoices/send";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticate(req);
  const authError = apiAuthError(ctx);
  if (authError) return authError;
  if (!ctx) return apiError("INVALID_API_KEY", "Missing or invalid API key.", 401);
  const { id } = await params;
  const db = adminClient();
  const { data: invoice, error } = await db.from("invoices").select("id,status")
    .eq("id", id).eq("merchant_id", ctx.merchantId).eq("livemode", ctx.mode === "live").maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", "Could not load the invoice.", 500);
  if (!invoice) return apiError("INVOICE_NOT_FOUND", "No invoice with that ID.", 404);
  if (!["DRAFT", "SENT", "AWAITING_PAYMENT"].includes(invoice.status)) {
    return apiError("VALIDATION_ERROR", `Invoices with status ${invoice.status} cannot be sent.`, 409);
  }
  try {
    const sent = await sendInvoiceEmail(id, ctx.merchantId);
    return NextResponse.json(sent);
  } catch (error) {
    return apiError("INTERNAL_ERROR", error instanceof Error ? error.message : "Could not send the invoice.", 502);
  }
}
