import { notFound } from "next/navigation";
import { loadPayable } from "@/lib/payments/entity";
import { adminClient } from "@/lib/supabase/admin";
import { calculateFee } from "@/lib/fees/calculate";
import { money } from "@/lib/format";
import { Logo } from "@/components/Logo";
import Checkout from "./Checkout";
import type { CSSProperties } from "react";
import { invoiceTextColor } from "@/lib/invoices/design";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay with crypto | Monifyd" };

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await loadPayable(id);
  if (!p) notFound();

  const db = adminClient();
  const [{ data: wallets }, { data: nets }] = await Promise.all([
    db.from("wallets").select("network").eq("merchant_id", p.merchantId),
    db.from("supported_networks").select("id,name"),
  ]);
  const have = new Set((wallets ?? []).map((w: any) => w.network));
  const name = (n: string) => (nets ?? []).find((x: any) => x.id === n)?.name ?? n;
  const options = p.accepted.flatMap((a) => a.networks.filter((n) => have.has(n)).map((n) => ({ asset: a.asset, network: n, networkName: name(n) })));
  const fee = calculateFee(p.amountCents);
  const design = p.invoiceDesign;
  const invoiceStyle = design ? ({ "--invoice-primary": design.primary, "--invoice-primary-ink": invoiceTextColor(design.primary), "--invoice-accent": design.accent } as CSSProperties) : undefined;
  const invoiceItems = p.lineItems?.length ? p.lineItems : [{ description: p.title, quantity: 1, unit_price_cents: p.amountCents, amount_cents: p.amountCents }];
  const designSections = design ? design.order.map((section) => <div key={section}>
    {section === "items" && <div className="pay-invoice-items">{invoiceItems.map((item, index) => <div key={index}><span>{item.description} <small>× {item.quantity}</small></span><strong>{money(item.amount_cents, p.currency)}</strong></div>)}<div className="pay-invoice-subtotal"><span>Subtotal</span><strong>{money(p.amountCents, p.currency)}</strong></div></div>}
    {section === "contact" && design.visible.contact && (design.contact || design.website) && <div>{design.contact && <p className="pay-invoice-footer">{design.contact}</p>}{design.website && <p className="pay-invoice-footer">{design.website}</p>}</div>}
    {section === "instructions" && design.visible.instructions && design.paymentInstructions && <p className="pay-invoice-instructions">{design.paymentInstructions}</p>}
    {section === "terms" && design.visible.terms && design.terms && <p className="pay-invoice-terms">{design.terms}</p>}
    {section === "footer" && design.visible.footer && design.footer && <p className="pay-invoice-footer">{design.footer}</p>}
  </div>) : null;

  return (
    <main className={`pay ${design ? `pay-invoice invoice-${design.template} invoice-font-${design.font} invoice-size-${design.textSize}` : ""}`} style={invoiceStyle}><div className="box">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className={`pay-merchant logo-${design?.logoPosition ?? "start"}`}>{design?.logoUrl && <img src={design.logoUrl} alt="" style={{ maxWidth: design.logoSize === "small" ? 60 : design.logoSize === "large" ? 120 : 90 }} />}<strong>{p.merchantName}</strong></div><span style={{ color: "var(--muted)", fontSize: ".85rem" }}>{p.invoiceNumber ?? ""}</span>
      </div>
      {design && <h1 className="pay-invoice-heading" style={{ color: invoiceTextColor(design.primary) }}>{design.heading}</h1>}
      {p.customerName && <p className="pay-invoice-customer">Bill to {p.customerName}{p.customerEmail ? ` · ${p.customerEmail}` : ""}</p>}
      <p style={{ color: "var(--muted)" }}>{p.title}</p>
      {p.description && <p className="pay-invoice-notes">{p.description}</p>}
      {designSections}
      {p.dueDate && <p className="pay-invoice-due">Due {p.dueDate}</p>}
      <p className="amt">{money(p.amountCents, p.currency)}</p>
      <p style={{ color: "var(--muted)", fontSize: ".85rem", marginBottom: 20 }}>Amount due</p>
      {!p.payable ? <p className="flash err" role="alert">{p.reason}</p>
        : options.length === 0 ? <p className="flash err" role="alert">This merchant has not finished setting up payments yet.</p>
        : <Checkout reference={p.id} options={options} amountCents={p.amountCents} feeCents={fee.totalFeeCents} currency={p.currency} returnUrl={p.successUrl} />}
      {design?.thankYou && <p className="pay-invoice-thanks">{design.thankYou}</p>}
      <p style={{ marginTop: 24, fontSize: ".8rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>Powered by <Logo size={20} /></p>
    </div></main>
  );
}
