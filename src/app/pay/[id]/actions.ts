"use server";
import QRCode from "qrcode";
import { adminClient } from "@/lib/supabase/admin";
import { loadPayable } from "@/lib/payments/entity";
import { calculateFee } from "@/lib/fees/calculate";
import { usdRate } from "@/lib/pricing/quote";
import { publicId } from "@/lib/security/ids";
import { transition } from "@/lib/payments/state";
import { scanPayment } from "@/lib/payments/detect";
import { dustFor, fromBase, quoteUnits } from "@/lib/payments/amounts";
import { emitEvent } from "@/lib/webhooks/emit";
import { paymentData } from "@/lib/webhooks/payload";

export type Started = {
  paymentId: string; address: string; cryptoAmount: string; asset: string; network: string;
  totalCents: number; feeCents: number; qrSvg: string; expiresAt: string; status: string; receivedAmount: string; decimals: number;
};

const QUOTE_MINUTES = 15;

export async function startPayment(reference: string, asset: string, network: string): Promise<Started | { error: string }> {
  const p = await loadPayable(reference);
  if (!p) return { error: "Payment not found." };
  if (!p.payable) return { error: p.reason };
  if (!p.accepted.some((a) => a.asset === asset && a.networks.includes(network))) return { error: "That coin and network is not accepted for this payment." };

  const db = adminClient();
  const { data: wallet } = await db.from("wallets").select("address").eq("merchant_id", p.merchantId).eq("network", network).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!wallet) return { error: "The merchant has no wallet on this network." };
  const { data: an } = await db.from("asset_networks").select("decimals").eq("asset", asset).eq("network", network).eq("enabled", true).maybeSingle();
  if (!an) return { error: "That coin is not available on this network." };
  const decimals: number = an.decimals ?? 8;

  const col = p.kind === "link" ? "payment_link_id" : "invoice_id";
  const { data: existing } = await db.from("payments").select("*").eq(col, p.id).eq("asset", asset).eq("network", network).in("status", ["AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING"]).gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
  let pay = existing;

  if (!pay) {
    let rate: number;
    try { rate = await usdRate(asset); } catch { return { error: `Could not get a price for ${asset} right now. Try again in a moment or choose another coin.` }; }
    const fee = calculateFee(p.amountCents);

    // Give this payment an amount no other open payment on the same wallet has, so incoming funds can be matched to it.
    let cryptoAmount = "";
    for (let i = 0; i < 25 && !cryptoAmount; i++) {
      const candidate = fromBase(quoteUnits(fee.customerTotalCents, rate, decimals, dustFor(asset, decimals)), decimals);
      const { data: clash } = await db.from("payments").select("id").eq("network", network).eq("asset", asset).eq("receiving_address", wallet.address).eq("crypto_amount", candidate).in("status", ["AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING"]).limit(1);
      if (!clash || clash.length === 0) cryptoAmount = candidate;
    }
    if (!cryptoAmount) return { error: "Too many payments are open on this wallet. Try again in a minute." };

    const expiresAt = new Date(Date.now() + QUOTE_MINUTES * 60_000).toISOString();
    const { data: quote } = await db.from("price_quotes").insert({ asset, network, fiat_currency: p.currency, rate, crypto_amount: cryptoAmount, expires_at: expiresAt }).select("id").single();
    const { data: created, error } = await db.from("payments").insert({
      id: publicId("pay"), merchant_id: p.merchantId, livemode: true, [col]: p.id, quote_id: quote?.id,
      amount_cents: fee.amountCents, fee_cents: fee.totalFeeCents, total_cents: fee.customerTotalCents,
      currency: p.currency, asset, network, crypto_amount: cryptoAmount, receiving_address: wallet.address,
      status: "AWAITING_PAYMENT", expires_at: expiresAt,
    }).select("*").single();
    if (error || !created) return { error: "Could not start the payment. Try again." };
    await db.from("payment_status_log").insert({ payment_id: created.id, from_status: null, to_status: "AWAITING_PAYMENT" });
    pay = created;
    await emitEvent(p.merchantId, "payment.created", await paymentData(db, created));
  }

  const payload = network === "bitcoin" ? `bitcoin:${pay.receiving_address}?amount=${pay.crypto_amount}` : pay.receiving_address;
  const qrSvg = await QRCode.toString(payload, { type: "svg", margin: 1 });
  return {
    paymentId: pay.id, address: pay.receiving_address, cryptoAmount: String(pay.crypto_amount), asset, network,
    totalCents: Number(pay.total_cents), feeCents: Number(pay.fee_cents), qrSvg, expiresAt: pay.expires_at, status: pay.status,
    receivedAmount: String(pay.received_amount ?? "0"),
    decimals,
  };
}

/** Polled by the checkout page. Each poll also checks the chain for this payment (throttled). */
export async function getStatus(paymentId: string): Promise<{ status?: string; confirmations?: number; receivedAmount?: string; error?: string }> {
  const db = adminClient();
  try { await scanPayment(paymentId); } catch { /* the scheduled run will retry */ }
  const { data: pay } = await db.from("payments").select("status,expires_at,confirmations,received_amount").eq("id", paymentId).maybeSingle();
  if (!pay) return { error: "Payment not found." };
  if (pay.status === "AWAITING_PAYMENT" && new Date(pay.expires_at) < new Date()) {
    await transition(db, paymentId, "AWAITING_PAYMENT", "EXPIRED");
    return { status: "EXPIRED", receivedAmount: String(pay.received_amount ?? "0") };
  }
  return { status: pay.status, confirmations: pay.confirmations, receivedAmount: String(pay.received_amount ?? "0") };
}
