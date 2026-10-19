import { adminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/format";
import { invoiceEmail } from "@/lib/email/invoice";
import { sendEmail } from "@/lib/email/send";
import { emitEvent } from "@/lib/webhooks/emit";
import { invoiceData } from "@/lib/webhooks/payload";

export async function sendInvoiceEmail(invoiceId: string, merchantId: string) {
  const db = adminClient();
  const [{ data: invoice, error: invoiceError }, { data: profile, error: profileError }] = await Promise.all([
    db.from("invoices").select("*").eq("id", invoiceId).eq("merchant_id", merchantId).maybeSingle(),
    db.from("profiles").select("business_name").eq("id", merchantId).maybeSingle(),
  ]);
  if (invoiceError || profileError) throw new Error("Could not load the invoice or merchant profile.");
  if (!invoice) throw new Error("Invoice not found.");
  if (!["DRAFT", "SENT", "AWAITING_PAYMENT"].includes(invoice.status)) {
    throw new Error(`Invoices with status ${invoice.status} cannot be sent.`);
  }

  const { subject, html } = invoiceEmail(invoice, profile?.business_name ?? "Your merchant");
  await sendEmail({ to: invoice.customer_email, subject, html });
  const { data: updated, error } = await db.from("invoices")
    .update({ status: "AWAITING_PAYMENT", updated_at: new Date().toISOString() })
    .eq("id", invoiceId).eq("merchant_id", merchantId).in("status", ["DRAFT", "SENT"])
    .select("*").maybeSingle();
  if (error) throw new Error("Email was sent, but the invoice status could not be updated.");
  const { data: current, error: currentError } = updated
    ? { data: updated, error: null }
    : await db.from("invoices").select("*").eq("id", invoiceId).eq("merchant_id", merchantId).maybeSingle();
  if (currentError) throw new Error("Email was sent, but the updated invoice could not be loaded.");
  if (!current) throw new Error("Email was sent, but the invoice is no longer available.");
  await emitEvent(merchantId, "invoice.sent", invoiceData(current));
  return current;
}

export function invoicePaymentUrl(invoiceId: string) {
  return `${appUrl()}/pay/${invoiceId}`;
}
