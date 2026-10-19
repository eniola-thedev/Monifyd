import { esc, money } from "@/lib/format";
import { invoicePaymentUrl } from "@/lib/invoices/send";

type ReminderInvoice = {
  id: string;
  invoice_number: string;
  title: string;
  amount_cents: number;
  currency: string;
  due_date: string | null;
  customer_name: string | null;
};

export function invoiceReminderEmail(invoice: ReminderInvoice, merchant: string, dueToday: boolean) {
  const dueLine = invoice.due_date
    ? `<p>${dueToday ? "Payment is due today" : `Payment is due on ${esc(invoice.due_date)}`}.</p>`
    : "";
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0d100e">
<p>${invoice.customer_name ? `Hi ${esc(invoice.customer_name)},` : "Hello,"}</p>
<p>This is a reminder about invoice <strong>${esc(invoice.invoice_number)}</strong> from ${esc(merchant)}.</p>
<p>${esc(invoice.title)} — <strong>${money(invoice.amount_cents, invoice.currency)}</strong></p>
${dueLine}
<p><a href="${invoicePaymentUrl(invoice.id)}" style="display:inline-block;background:#5be37d;color:#052112;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Pay invoice</a></p>
</div>`;
  return { subject: `Reminder: invoice ${invoice.invoice_number} from ${merchant}`, html };
}
