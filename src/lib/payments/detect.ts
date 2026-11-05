import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { adapterFor } from "@/lib/blockchain";
import { transition, settle } from "./state";
import { toBase, fromBase, paymentOutcome, confirmedTotal, inAutoMatchBand } from "./amounts";
import { paymentData } from "@/lib/webhooks/payload";
import { emitEvent } from "@/lib/webhooks/emit";

const OPEN = ["AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING"];
const LATE_WINDOW_MS = 24 * 3600_000; // keep watching a wallet this long after a quote expired, to catch late payments
const THROTTLE_MS = 8_000;

type Result = { groups: number; matched: number; paid: number; underpaid: number; unmatched: number; errors: string[] };

/** Binds an incoming transfer to a payment and adds its amount to the payment total. */
export async function bindTransfer(db: SupabaseClient, p: any, network: string, txHash: string, units: bigint, decimals: number, confirmations: number): Promise<boolean> {
  const amount = fromBase(units, decimals);
  const { error } = await db.from("payment_transactions").insert({ payment_id: p.id, network, tx_hash: txHash, amount, confirmations });
  if (error?.code === "23505") return false; // a transaction can only ever belong to one payment
  if (error) throw new Error(`Could not bind transfer ${txHash} to payment ${p.id}: ${error.message}`);
  const { data: current, error: currentError } = await db.from("payments").select("status").eq("id", p.id).maybeSingle();
  if (currentError || !current) throw new Error(`Could not load payment ${p.id} after binding a transfer.`);
  const additionalTransfer = p.status === "CONFIRMING" && current.status === "CONFIRMING";
  const { data: txs, error: txError } = await db.from("payment_transactions").select("amount,confirmations").eq("payment_id", p.id);
  if (txError) throw new Error(`Could not total transfers for payment ${p.id}: ${txError.message}`);
  const received = (txs ?? []).reduce((sum: bigint, tx: any) => sum + toBase(String(tx.amount), decimals), 0n);
  let status: string = current.status;
  if (status === "AWAITING_PAYMENT" || status === "EXPIRED") {
    if (await transition(db, p.id, status, "PAYMENT_DETECTED", { received_amount: fromBase(received, decimals), confirmations })) {
      status = "PAYMENT_DETECTED";
    } else {
      const { data: fresh } = await db.from("payments").select("status").eq("id", p.id).maybeSingle();
      status = fresh?.status ?? "";
      if (status !== "PAYMENT_DETECTED" && status !== "CONFIRMING") {
        await db.from("payment_transactions").delete().eq("network", network).eq("tx_hash", txHash);
        return false;
      }
    }
  }
  if (status === "PAYMENT_DETECTED" || status === "CONFIRMING") {
    const totalConfirmed = confirmedTotal(txs ?? [], decimals, 0);
    const { error: updateError } = await db.from("payments").update({
      received_amount: fromBase(totalConfirmed, decimals),
      confirmations: Math.min(...(txs ?? []).map((tx: any) => Number(tx.confirmations))),
    }).eq("id", p.id).eq("status", status);
    if (updateError) throw new Error(`Could not update payment ${p.id}: ${updateError.message}`);
    if (status === "PAYMENT_DETECTED") await transition(db, p.id, "PAYMENT_DETECTED", "CONFIRMING");
  }
  if (additionalTransfer) {
    const { error: notificationError } = await db.from("notifications").insert({
      merchant_id: p.merchant_id, type: "payment.partial",
      body: `An additional transfer of ${amount} ${p.asset} was detected for payment ${p.id}.`,
    });
    if (notificationError) throw new Error(`Could not notify merchant of an additional payment transfer: ${notificationError.message}`);
    await emitEvent(p.merchant_id, "payment.partial", await paymentData(db, { ...p, received_amount: fromBase(received, decimals) }));
  }
  return true;
}

/**
 * Looks for incoming transfers to the receiving addresses of open payments and matches each one to a payment.
 * - An exact amount match is attributed automatically.
 * - When only one payment is open on a wallet, smaller transfers accumulate toward it.
 * - Anything else is saved as an unmatched transfer for the merchant, unless the merchant opted in to automatic
 *   matching and exactly one payment is open on that wallet.
 * Confirmed totals that reach the expected amount settle immediately. Partial totals remain open until expiry.
 * Safe to run concurrently: a transaction can only be bound once, and every status move is conditional.
 */
export async function runDetection(onlyPaymentId?: string): Promise<Result> {
  const db = adminClient();
  const out: Result = { groups: 0, matched: 0, paid: 0, underpaid: 0, unmatched: 0, errors: [] };

  const lateCutoff = new Date(Date.now() - LATE_WINDOW_MS).toISOString();
  let q = db.from("payments").select("*").eq("livemode", true).or(`status.in.(${OPEN.join(",")}),and(status.eq.EXPIRED,expires_at.gt.${lateCutoff})`);
  if (onlyPaymentId) q = q.eq("id", onlyPaymentId);
  const { data: open, error: openError } = await q;
  if (openError) throw new Error(`Could not load open payments for detection: ${openError.message}`);
  if (!open || open.length === 0) return out;

  const [{ data: ans, error: assetError }, { data: nets, error: networkError }] = await Promise.all([
    db.from("asset_networks").select("asset,network,decimals,token_contract"),
    db.from("supported_networks").select("id,required_confirmations"),
  ]);
  if (assetError || networkError) throw new Error(`Could not load chain configuration: ${assetError?.message ?? networkError?.message}`);
  const meta = (asset: string, network: string) => (ans ?? []).find((a: any) => a.asset === asset && a.network === network);
  const required = (network: string) => (nets ?? []).find((n: any) => n.id === network)?.required_confirmations ?? 12;
  const autoMatch = new Map<string, boolean>();
  const wantsAutoMatch = async (merchantId: string) => {
    if (!autoMatch.has(merchantId)) {
      const { data, error } = await db.from("profiles").select("match_wrong_amounts").eq("id", merchantId).maybeSingle();
      if (error) throw new Error(`Could not load merchant matching preferences: ${error.message}`);
      autoMatch.set(merchantId, !!data?.match_wrong_amounts);
    }
    return autoMatch.get(merchantId)!;
  };

  // 1. Find new transfers for every (network, asset, address) that has an awaiting or recently expired payment.
  const groups = new Map<string, any[]>();
  for (const p of open.filter((p: any) => p.status !== "PAID" && p.status !== "UNDERPAID" && p.status !== "OVERPAID" && p.status !== "FAILED" && p.status !== "CANCELLED")) {
    const k = `${p.network}|${p.asset}|${p.receiving_address}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const [key, pays] of groups) {
    const awaiting = pays.filter((p) => OPEN.includes(p.status));
    const [network, asset, address] = key.split("|");
    const m = meta(asset, network);
    if (!m) continue;
    out.groups++;
    const oldest = Math.min(...pays.map((p) => Date.parse(p.created_at)));
    try {
      const { data: cur, error: cursorError } = await db.from("scan_cursors").select("cursor").eq("network", network).eq("asset", asset).eq("address", address).maybeSingle();
      if (cursorError) throw new Error(`Could not load scan cursor: ${cursorError.message}`);
      const res = await adapterFor(network).scan({
        network, asset, address, tokenContract: m.token_contract, cursor: cur?.cursor ?? null,
        fromTime: Math.floor((oldest - 3600_000) / 1000),
      });
      if (res.cursor !== null) {
        const { error: saveCursorError } = await db.from("scan_cursors").upsert({ network, asset, address, cursor: res.cursor, updated_at: new Date().toISOString() });
        if (saveCursorError) throw new Error(`Could not save scan cursor: ${saveCursorError.message}`);
      }

      for (const t of res.transfers) {
        if (t.time !== undefined && t.time * 1000 < oldest - 3600_000) continue; // older than anything we are waiting for
        const [{ data: bound, error: boundError }, { data: seen, error: seenError }] = await Promise.all([
          db.from("payment_transactions").select("id").eq("network", network).eq("tx_hash", t.txHash).maybeSingle(),
          db.from("unmatched_transfers").select("id").eq("network", network).eq("tx_hash", t.txHash).maybeSingle(),
        ]);
        if (boundError || seenError) throw new Error(`Could not check transfer assignment: ${boundError?.message ?? seenError?.message}`);
        if (bound || seen) continue;

        const afterQuote = (p: any) => t.time === undefined || t.time * 1000 >= Date.parse(p.created_at) - 60_000;
        const exact = awaiting.filter((p) => afterQuote(p) && toBase(String(p.crypto_amount), m.decimals) === t.amountBaseUnits);
        if (exact.length === 1) {
          if (await bindTransfer(db, exact[0], network, t.txHash, t.amountBaseUnits, m.decimals, t.confirmations)) out.matched++;
          continue;
        }
        if (exact.length > 1) continue;
        if (awaiting.length === 1 && afterQuote(awaiting[0])
          && t.amountBaseUnits < toBase(String(awaiting[0].crypto_amount), m.decimals)) {
          if (await bindTransfer(db, awaiting[0], network, t.txHash, t.amountBaseUnits, m.decimals, t.confirmations)) out.matched++;
          continue;
        }
        if (awaiting.length === 1 && (await wantsAutoMatch(awaiting[0].merchant_id))) {
          const p = awaiting[0];
          if (afterQuote(p) && inAutoMatchBand(t.amountBaseUnits, toBase(String(p.crypto_amount), m.decimals))) {
            if (await bindTransfer(db, p, network, t.txHash, t.amountBaseUnits, m.decimals, t.confirmations)) out.matched++;
            continue;
          }
        }
        const { error } = await db.from("unmatched_transfers").insert({ merchant_id: pays[0].merchant_id, network, asset, address, tx_hash: t.txHash, amount: fromBase(t.amountBaseUnits, m.decimals), confirmations: t.confirmations });
        if (!error) {
          out.unmatched++;
          const { error: notificationError } = await db.from("notifications").insert({
            merchant_id: pays[0].merchant_id, type: "payment.unmatched",
            body: `An unmatched ${asset} transfer was detected on ${network}. Review it in Payments.`,
          });
          if (notificationError) throw new Error(`Could not notify merchant of an unmatched transfer: ${notificationError.message}`);
        } else if (error.code !== "23505") {
          throw new Error(`Could not save unmatched transfer: ${error.message}`);
        }
      }
    } catch (e) {
      out.errors.push(`${key}: ${e instanceof Error ? e.message : "scan failed"}`);
    }
  }

  // 2. Track confirmations. At the required depth, compare what arrived with what was asked for.
  let cq = db.from("payments").select("*").eq("livemode", true).in("status", ["AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING"]);
  if (onlyPaymentId) cq = cq.eq("id", onlyPaymentId);
  const { data: confirming, error: confirmingError } = await cq;
  if (confirmingError) throw new Error(`Could not load payments awaiting confirmation: ${confirmingError.message}`);
  for (const p of confirming ?? []) {
    try {
      const { data: txs, error: txError } = await db.from("payment_transactions")
        .select("id,tx_hash,amount,confirmations").eq("payment_id", p.id);
      if (txError) throw new Error(`Could not load payment transfers: ${txError.message}`);
      if (!txs?.length) continue;
      let allConfirmed = true;
      let minConfirmations = Number.MAX_SAFE_INTEGER;
      const dec = meta(p.asset, p.network)?.decimals ?? 8;
      const transferConfirmations: { amount: string; confirmations: number }[] = [];
      for (const tx of txs) {
        const c = await adapterFor(p.network).confirmations({ network: p.network, txHash: tx.tx_hash });
        if (c.failed) { allConfirmed = false; transferConfirmations.push({ amount: String(tx.amount), confirmations: 0 }); continue; }
        const { error: updateError } = await db.from("payment_transactions").update({ confirmations: c.confirmations }).eq("id", tx.id);
        if (updateError) throw new Error(`Could not update transfer confirmations: ${updateError.message}`);
        if (c.confirmations < required(p.network)) allConfirmed = false;
        else minConfirmations = Math.min(minConfirmations, c.confirmations);
        transferConfirmations.push({ amount: String(tx.amount), confirmations: c.confirmations });
      }
      const confirmedUnits = confirmedTotal(transferConfirmations, dec, required(p.network));
      let status = p.status;
      if (status === "AWAITING_PAYMENT") {
        const detectedUnits = txs.reduce((sum: bigint, tx: any) => sum + toBase(String(tx.amount), dec), 0n);
        const detectedConfirmations = Math.min(...txs.map((tx: any) => Number(tx.confirmations)));
        if (await transition(db, p.id, "AWAITING_PAYMENT", "PAYMENT_DETECTED", {
          received_amount: fromBase(detectedUnits, dec), confirmations: detectedConfirmations,
        })) {
          status = "PAYMENT_DETECTED";
        } else {
          const { data: latest, error: latestError } = await db.from("payments").select("status").eq("id", p.id).maybeSingle();
          if (latestError) throw new Error(`Could not reload payment ${p.id} after detection conflict: ${latestError.message}`);
          status = latest?.status ?? "";
        }
      }
      if (status === "PAYMENT_DETECTED") {
        if (await transition(db, p.id, "PAYMENT_DETECTED", "CONFIRMING")) {
          status = "CONFIRMING";
        } else {
          const { data: latest, error: latestError } = await db.from("payments").select("status").eq("id", p.id).maybeSingle();
          if (latestError) throw new Error(`Could not reload payment ${p.id} after confirmation conflict: ${latestError.message}`);
          status = latest?.status ?? "";
        }
      }
      if (status !== "CONFIRMING") continue;
      const confirmedAmount = fromBase(confirmedUnits, dec);
      const confirmations = minConfirmations === Number.MAX_SAFE_INTEGER ? 0 : minConfirmations;
      const { error: aggregateError } = await db.from("payments").update({
        received_amount: confirmedAmount, confirmations,
      }).eq("id", p.id).eq("status", "CONFIRMING");
      if (aggregateError) throw new Error(`Could not update confirmed payment total: ${aggregateError.message}`);

      const expected = toBase(String(p.crypto_amount), dec);
      const verdict = paymentOutcome(
        confirmedUnits, expected, new Date(p.expires_at) < new Date(), allConfirmed,
      );
      if (verdict === "PAID" || verdict === "OVERPAID") {
        const fresh = { ...p, received_amount: confirmedAmount, status: verdict, confirmations };
        if (await settle(db, fresh, verdict, "CONFIRMING")) out.paid++;
      } else if (verdict === "UNDERPAID") {
        if (await transition(db, p.id, "CONFIRMING", "UNDERPAID", { received_amount: confirmedAmount, confirmations })) out.underpaid++;
      }
    } catch (e) {
      out.errors.push(`${p.id}: ${e instanceof Error ? e.message : "confirmation check failed"}`);
    }
  }

  // 3. Expire quotes nobody paid.
  const { data: stale } = await db.from("payments").select("id").eq("livemode", true).eq("status", "AWAITING_PAYMENT").lt("expires_at", new Date().toISOString());
  for (const p of stale ?? []) await transition(db, p.id, "AWAITING_PAYMENT", "EXPIRED");
  return out;
}

/** Called while a customer has the checkout page open, so payments confirm quickly without waiting for the scheduled run. */
export async function scanPayment(paymentId: string) {
  const db = adminClient();
  const { data: p, error } = await db.from("payments").select("id,status,last_scanned_at").eq("id", paymentId).maybeSingle();
  if (error) throw new Error(`Could not load payment before scanning: ${error.message}`);
  if (!p || !OPEN.includes(p.status)) return { errors: [] as string[] };
  if (p.last_scanned_at && Date.now() - new Date(p.last_scanned_at).getTime() < THROTTLE_MS) return { errors: [] as string[] };
  const { error: updateError } = await db.from("payments").update({ last_scanned_at: new Date().toISOString() }).eq("id", paymentId);
  if (updateError) throw new Error(`Could not update payment scan time: ${updateError.message}`);
  return runDetection(paymentId);
}
