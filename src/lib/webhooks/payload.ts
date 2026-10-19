import type { SupabaseClient } from "@supabase/supabase-js";
import { fromBase, toBase } from "@/lib/payments/amounts";

/** The public shape of a payment inside a webhook. Includes the merchant's own reference and metadata. */
export async function paymentData(db: SupabaseClient, p: any) {
  let metadata: unknown = {}, reference: string | null = null;
  if (p.payment_link_id) {
    const { data, error } = await db.from("payment_links").select("metadata,reference").eq("id", p.payment_link_id).maybeSingle();
    if (error) throw new Error(`Could not load payment link metadata for webhook: ${error.message}`);
    metadata = data?.metadata ?? {}; reference = data?.reference ?? null;
  } else if (p.invoice_id) {
    const { data, error } = await db.from("invoices").select("metadata").eq("id", p.invoice_id).maybeSingle();
    if (error) throw new Error(`Could not load invoice metadata for webhook: ${error.message}`);
    metadata = data?.metadata ?? {};
  }
  const { data: an, error: assetError } = await db.from("asset_networks").select("decimals").eq("asset", p.asset).eq("network", p.network).maybeSingle();
  if (assetError) throw new Error(`Could not load asset precision for webhook: ${assetError.message}`);
  const dec: number = an?.decimals ?? 8;
  const received = toBase(String(p.received_amount ?? "0"), dec);
  const expected = toBase(String(p.crypto_amount), dec);
  return {
    id: p.id, status: p.status, amount_cents: Number(p.amount_cents), fee_cents: Number(p.fee_cents), total_cents: Number(p.total_cents),
    currency: p.currency, asset: p.asset, network: p.network, crypto_amount: String(p.crypto_amount), receiving_address: p.receiving_address,
    received_amount: String(p.received_amount ?? "0"),
    shortfall: received > 0n && received < expected ? fromBase(expected - received, dec) : null,
    excess: received > expected ? fromBase(received - expected, dec) : null,
    confirmations: p.confirmations, payment_link_id: p.payment_link_id, invoice_id: p.invoice_id, reference, metadata,
    created_at: p.created_at, confirmed_at: p.confirmed_at ?? null,
  };
}

export function invoiceData(i: any) {
  return {
    id: i.id, invoice_number: i.invoice_number, status: i.status, amount_cents: Number(i.amount_cents), currency: i.currency,
    customer_email: i.customer_email, title: i.title, due_date: i.due_date ?? null, metadata: i.metadata ?? {},
  };
}
