import { esc, money, appUrl } from "@/lib/format";
import { invoiceContrastOn, invoiceTextColor, parseInvoiceDesign } from "@/lib/invoices/design";

export function invoiceEmail(i: { id: string; invoice_number: string; title: string; description?: string | null; amount_cents: number; currency: string; due_date?: string | null; created_at?: string; customer_name?: string | null; customer_email?: string | null; line_items?: unknown; design?: unknown }, merchant: string) {
  const design = parseInvoiceDesign(i.design);
  const url = `${appUrl()}/pay/${i.id}`;
  const subject = `${design.heading || "Invoice"} ${i.invoice_number} from ${merchant}`;
  const rows = Array.isArray(i.line_items) ? i.line_items as { description?: string; quantity?: number; unit_price_cents?: number; amount_cents?: number }[] : [];
  const items = rows.length ? rows : [{ description: i.title, quantity: 1, unit_price_cents: i.amount_cents, amount_cents: i.amount_cents }];
  const itemHtml = items.map((item) => `<tr><td style="padding:10px 6px;border-bottom:1px solid #e4e9e6">${esc(item.description ?? "Item")}</td><td style="padding:10px 6px;text-align:right;border-bottom:1px solid #e4e9e6">${Number(item.quantity ?? 1)}</td><td style="padding:10px 6px;text-align:right;border-bottom:1px solid #e4e9e6">${money(Number(item.unit_price_cents ?? 0), i.currency)}</td><td style="padding:10px 6px;text-align:right;border-bottom:1px solid #e4e9e6">${money(Number(item.amount_cents ?? 0), i.currency)}</td></tr>`).join("");
  const font = design.font === "serif" ? "Georgia,serif" : design.font === "mono" ? "ui-monospace,monospace" : "system-ui,sans-serif";
  const logo = design.logoUrl ? `<img src="${esc(design.logoUrl)}" alt="${esc(merchant)}" style="display:block;max-width:${design.logoSize === "small" ? 90 : design.logoSize === "large" ? 180 : 130}px;max-height:72px;object-fit:contain;margin:${design.logoPosition === "center" ? "0 auto 12px" : design.logoPosition === "end" ? "0 0 12px auto" : "0 0 12px"}">` : "";
  const sections: Record<string, string> = {
    items: `<table style="width:100%;margin:18px 0;border-collapse:collapse"><thead><tr style="color:#47524c;text-align:left"><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${itemHtml}</tbody></table><p style="text-align:right">Subtotal: ${money(i.amount_cents, i.currency)}</p><p style="text-align:right;font-size:20px"><strong>Total: ${money(i.amount_cents, i.currency)}</strong></p>`,
    contact: [design.visible.contact && design.contact ? `<p>${esc(design.contact)}</p>` : "", design.website ? `<p>${esc(design.website)}</p>` : ""].join(""),
    instructions: design.visible.instructions && design.paymentInstructions ? `<p>${esc(design.paymentInstructions)}</p>` : "",
    terms: design.visible.terms && design.terms ? `<p style="white-space:pre-line">${esc(design.terms)}</p>` : "",
    footer: design.visible.footer && design.footer ? `<p style="border-top:1px solid #e4e9e6;padding-top:12px;color:#47524c">${esc(design.footer)}</p>` : "",
  };
  const orderedSections = design.order.map((section) => sections[section] ?? "").join("");
  const borderRadius = design.template === "corporate" ? "3px" : design.template === "creative" ? "20px 4px 20px 4px" : "16px";
  const topBorder = design.template === "modern" ? "3px" : design.template === "corporate" ? "10px" : "6px";
  const textSize = design.textSize === "compact" ? "13px" : design.textSize === "large" ? "16px" : "14px";
  const issued = i.created_at ? new Date(i.created_at).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB");
  const html = `<div style="font-family:${font};font-size:${textSize};max-width:680px;margin:auto;padding:24px;color:#0d100e;border:1px solid #dfe6e2;border-top:${topBorder} solid ${design.primary};border-radius:${borderRadius}">
${logo}<p style="color:${invoiceTextColor(design.primary)};font-size:13px">${esc(merchant)}</p><h1 style="color:${invoiceTextColor(design.primary)}">${esc(design.heading || "Invoice")}</h1><p>${esc(i.invoice_number)}</p><h2>${esc(i.title)}</h2>
<p>${i.customer_name ? `Bill to: ${esc(i.customer_name)}` : "Hello,"}<br>${esc(i.customer_email ?? "")}</p>
${i.description ? `<p>${esc(i.description)}</p>` : ""}
<p>Issued ${issued}${i.due_date ? ` · Due ${esc(i.due_date)}` : ""}</p>${orderedSections}${design.thankYou ? `<p>${esc(design.thankYou)}</p>` : ""}
<p><a href="${url}" style="display:inline-block;background:${design.accent};color:${invoiceContrastOn(design.accent)};padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Pay invoice</a></p>
<p style="color:#47524c;font-size:13px">Pay in crypto from your wallet. No account needed.</p></div>`;
  return { subject, html };
}
