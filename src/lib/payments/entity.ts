import { adminClient } from "@/lib/supabase/admin";
import type { Accepted } from "./accepted";
import { parseInvoiceDesign, type InvoiceDesign } from "@/lib/invoices/design";

export type Payable = {
  kind: "link" | "invoice"; id: string; merchantId: string; merchantName: string; title: string;
  amountCents: number; currency: string; accepted: Accepted; payable: boolean; reason: string;
  successUrl: string | null; cancelUrl: string | null; invoiceNumber?: string;
  invoiceDesign?: InvoiceDesign; lineItems?: { description: string; quantity: number; unit_price_cents: number; amount_cents: number }[];
  customerName?: string | null; customerEmail?: string; dueDate?: string | null; description?: string | null;
};

/** Loads a payment link (plink_...) or invoice (inv_...) by its public ID and says whether it can be paid right now. */
export async function loadPayable(ref: string): Promise<Payable | null> {
  const db = adminClient();
  const isInvoice = ref.startsWith("inv_");
  if (!isInvoice && !ref.startsWith("plink_")) return null;
  const { data: r } = await db.from(isInvoice ? "invoices" : "payment_links").select("*").eq("id", ref).maybeSingle();
  if (!r) return null;
  const { data: m } = await db.from("profiles").select("business_name,suspended_at,logo_url").eq("id", r.merchant_id).maybeSingle();
  const { data: deletion, error: deletionError } = await db.from("account_deletions")
    .select("user_id").eq("user_id", r.merchant_id).maybeSingle();

  let payable = !deletionError, reason = deletionError ? "Payments are temporarily unavailable. Please try again later." : "";
  const okStatuses = isInvoice ? ["SENT", "AWAITING_PAYMENT", "DRAFT"] : ["ACTIVE"];
  if (deletionError) { payable = false; }
  else if (m?.suspended_at || deletion) { payable = false; reason = "This merchant cannot accept payments right now."; }
  else if (r.status === "PAID") { payable = false; reason = "This has already been paid."; }
  else if (!okStatuses.includes(r.status)) { payable = false; reason = `This ${isInvoice ? "invoice" : "payment link"} is ${r.status.toLowerCase().replace(/_/g, " ")}.`; }
  else if (r.expires_at && new Date(r.expires_at) < new Date()) { payable = false; reason = "This payment request has expired."; }

  return {
    kind: isInvoice ? "invoice" : "link", id: r.id, merchantId: r.merchant_id,
    merchantName: m?.business_name ?? "Merchant",
    title: isInvoice ? r.title : r.description ?? "Payment",
    amountCents: Number(r.amount_cents), currency: r.currency, accepted: r.accepted_payments as Accepted,
    payable, reason, successUrl: r.success_url, cancelUrl: r.cancel_url, invoiceNumber: r.invoice_number,
    ...(isInvoice ? {
      invoiceDesign: parseInvoiceDesign(r.design, { ...parseInvoiceDesign({}), logoUrl: m?.logo_url ?? "" }),
      lineItems: Array.isArray(r.line_items) ? r.line_items : [], customerName: r.customer_name,
      customerEmail: r.customer_email, dueDate: r.due_date, description: r.description,
    } : {}),
  };
}
