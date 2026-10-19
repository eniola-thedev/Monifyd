"use server";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/session";
import { adminClient } from "@/lib/supabase/admin";
import { transition, settle } from "@/lib/payments/state";
import { bindTransfer, runDetection } from "@/lib/payments/detect";
import { fromBase, toBase } from "@/lib/payments/amounts";
import { parseRefundAmount } from "@/lib/refunds/amount";
import { fail, done } from "@/lib/flash";

const LIST = "/dashboard/payments";

/** Records a merchant-arranged refund; Monifyd never sends funds. */
export async function createRefund(fd: FormData) {
  const { user, authUser, supabase } = await requireEditor();
  const id = String(fd.get("payment") ?? "");
  const destination = String(fd.get("destination") ?? "").trim();
  const amountInput = String(fd.get("amount") ?? "").trim();
  const { data: payment, error: paymentError } = await supabase.from("payments").select("id,status,asset,network")
    .eq("id", id).eq("merchant_id", user.id).maybeSingle();
  if (paymentError) throw new Error(`Could not load payment for refund: ${paymentError.message}`);
  if (!payment || !["PAID", "OVERPAID", "UNDERPAID", "EXPIRED"].includes(payment.status)) {
    fail(`${LIST}/${encodeURIComponent(id)}`, "Refunds can only be recorded for confirmed payments.");
  }
  if (!destination || destination.length > 256) fail(`${LIST}/${encodeURIComponent(id)}`, "Enter a valid refund destination.");
  const customerEmail = String(fd.get("customer_email") ?? "").trim();
  if (customerEmail && (customerEmail.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail))) {
    fail(`${LIST}/${encodeURIComponent(id)}`, "Enter a valid customer email address.");
  }
  const { data: assetNetwork, error: assetError } = await supabase.from("asset_networks").select("decimals")
    .eq("asset", payment.asset).eq("network", payment.network).maybeSingle();
  if (assetError) throw new Error(`Could not load payment precision: ${assetError.message}`);
  const decimals: number = assetNetwork?.decimals ?? 8;
  const amountBase = parseRefundAmount(amountInput, decimals);
  if (amountBase === null) {
    fail(`${LIST}/${encodeURIComponent(id)}`, "Enter a valid positive refund amount using no more than the coin's supported decimal places.");
  }

  const { error } = await adminClient().rpc("create_refund_record", {
    p_merchant_id: user.id,
    p_payment_id: id,
    p_amount: fromBase(amountBase, decimals),
    p_destination: destination,
    p_customer_email: customerEmail || null,
  });
  if (error) fail(`${LIST}/${encodeURIComponent(id)}`, error.message);
  const { error: auditError } = await adminClient().from("audit_logs").insert({
    merchant_id: user.id, actor: authUser.id, action: "refund.recorded", target: id,
    details: { amount: fromBase(amountBase, decimals), asset: payment.asset, network: payment.network, destination },
  });
  if (auditError) throw new Error(`Refund was recorded, but its audit entry could not be saved: ${auditError.message}`);
  revalidatePath(`${LIST}/${id}`);
  done(`${LIST}/${id}`, customerEmail
    ? "Refund recorded. Send it from your wallet when ready; the customer will be emailed when you update its status."
    : "Refund recorded. Send it from your wallet when ready.");
}

/** Updates tracking only; crypto transfers are performed by the merchant. */
export async function updateRefund(fd: FormData) {
  const { user, authUser, supabase } = await requireEditor();
  const id = String(fd.get("payment") ?? "");
  const refundId = String(fd.get("refund") ?? "");
  const status = String(fd.get("status") ?? "");
  const txHash = String(fd.get("tx_hash") ?? "").trim();
  if (!["SENT", "CONFIRMED", "FAILED"].includes(status)) fail(`${LIST}/${encodeURIComponent(id)}`, "Choose a valid refund status.");
  if ((status === "SENT" || status === "CONFIRMED") && !txHash) {
    fail(`${LIST}/${encodeURIComponent(id)}`, "Enter the transaction hash before marking the refund sent or confirmed.");
  }
  if (txHash.length > 256) fail(`${LIST}/${encodeURIComponent(id)}`, "Transaction hash is too long.");
  const { data: refund, error: lookupError } = await supabase.from("refunds").select("id,payment_id,amount,asset,network,destination,customer_email")
    .eq("id", refundId).eq("payment_id", id).eq("merchant_id", user.id).maybeSingle();
  if (lookupError) throw new Error(`Could not load refund record: ${lookupError.message}`);
  if (!refund) fail(`${LIST}/${encodeURIComponent(id)}`, "Refund record not found.");
  const { error } = await adminClient().rpc("update_refund_record", {
    p_merchant_id: user.id, p_refund_id: refundId, p_status: status, p_tx_hash: txHash || null,
  });
  if (error) fail(`${LIST}/${encodeURIComponent(id)}`, error.message);
  const { error: auditError } = await adminClient().from("audit_logs").insert({
    merchant_id: user.id, actor: authUser.id, action: `refund.${status.toLowerCase()}`, target: id,
    details: { refund_id: refundId, amount: refund.amount, asset: refund.asset, network: refund.network, destination: refund.destination, tx_hash: txHash || null },
  });
  if (auditError) throw new Error(`Refund status was updated, but its audit entry could not be saved: ${auditError.message}`);
  revalidatePath(`${LIST}/${id}`);
  done(`${LIST}/${id}`, `Refund marked ${status.toLowerCase()}${refund.customer_email ? "; a customer update email is queued." : "."}`);
}

/** The merchant agrees to take the smaller amount as full payment. */
export async function acceptUnderpayment(fd: FormData) {
  const { user, authUser, supabase } = await requireEditor();
  const id = String(fd.get("id"));
  const { data: p } = await supabase.from("payments").select("*").eq("id", id).eq("merchant_id", user.id).eq("status", "UNDERPAID").maybeSingle();
  if (!p) fail(`${LIST}/${id}`, "This payment can no longer be accepted.");
  const db = adminClient();
  if (!(await settle(db, { ...p, status: "UNDERPAID" }, "PAID", "UNDERPAID", authUser.id, "payment.underpayment_accepted"))) {
    fail(`${LIST}/${id}`, "This payment can no longer be accepted.");
  }
  revalidatePath(`${LIST}/${id}`);
  done(`${LIST}/${id}`, "Marked as paid.");
}

/** The merchant closes the payment as unpaid. Funds already sent stay in their wallet, so any refund is up to them. */
export async function closeUnderpayment(fd: FormData) {
  const { user, authUser, supabase } = await requireEditor();
  const id = String(fd.get("id"));
  const { data: p } = await supabase.from("payments").select("id").eq("id", id).eq("merchant_id", user.id).eq("status", "UNDERPAID").maybeSingle();
  if (!p) fail(`${LIST}/${id}`, "This payment can no longer be closed.");
  await transition(adminClient(), id, "UNDERPAID", "EXPIRED");
  await adminClient().from("audit_logs").insert({ merchant_id: user.id, actor: authUser.id, action: "payment.underpayment_closed", target: id });
  revalidatePath(`${LIST}/${id}`);
  done(`${LIST}/${id}`, "Payment closed as unpaid.");
}

/** Ties an incoming transfer to a payment by hand. Also works for late payments on an expired quote. */
export async function assignTransfer(fd: FormData) {
  const { user, authUser, supabase } = await requireEditor();
  const transferId = String(fd.get("transfer"));
  const paymentId = String(fd.get("payment"));
  const [{ data: t }, { data: p }] = await Promise.all([
    supabase.from("unmatched_transfers").select("*").eq("id", transferId).eq("merchant_id", user.id).eq("status", "UNMATCHED").maybeSingle(),
    supabase.from("payments").select("*").eq("id", paymentId).eq("merchant_id", user.id).in("status", ["AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING", "EXPIRED"]).maybeSingle(),
  ]);
  if (!t || !p) fail(LIST, "Choose a payment that is still open or expired.");
  if (t.network !== p.network || t.asset !== p.asset || t.address !== p.receiving_address) fail(LIST, "That transfer was sent to a different wallet, coin or network than the payment.");
  const db = adminClient();
  const { data: an } = await db.from("asset_networks").select("decimals").eq("asset", t.asset).eq("network", t.network).maybeSingle();
  const dec: number = an?.decimals ?? 8;
  if (!(await bindTransfer(db, p, t.network, t.tx_hash, toBase(t.amount, dec), dec, t.confirmations))) fail(LIST, "Could not assign the transfer. Try again.");
  await db.from("unmatched_transfers").update({ status: "ASSIGNED", assigned_payment_id: p.id }).eq("id", t.id);
  await db.from("audit_logs").insert({ merchant_id: user.id, actor: authUser.id, action: "transfer.assigned", target: t.tx_hash, details: { payment: p.id } });
  try { await runDetection(p.id); } catch { /* the scheduler will continue */ }
  revalidatePath(LIST);
  done(LIST, "Transfer assigned. The payment will settle once it has enough confirmations.");
}

export async function ignoreTransfer(fd: FormData) {
  const { user, supabase } = await requireEditor();
  await supabase.from("unmatched_transfers").select("id").eq("id", String(fd.get("transfer"))).eq("merchant_id", user.id).maybeSingle()
    .then(({ data }) => data && adminClient().from("unmatched_transfers").update({ status: "IGNORED" }).eq("id", data.id));
  revalidatePath(LIST);
  done(LIST, "Transfer ignored.");
}
