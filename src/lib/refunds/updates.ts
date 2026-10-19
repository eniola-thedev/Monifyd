import { adminClient } from "@/lib/supabase/admin";
import { refundUpdateEmail } from "@/lib/email/refund-update";
import { sendEmail } from "@/lib/email/send";
import { recordOperationalEvent } from "@/lib/operations/events";

const MAX_ATTEMPTS = 3;

export async function processDueRefundCustomerUpdates(limit = 50) {
  const db = adminClient();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const { error: recoverError } = await db.from("refund_customer_updates")
    .update({ status: "PENDING", next_attempt_at: now, updated_at: now, last_error: "Previous delivery was interrupted; retrying." })
    .eq("status", "SENDING").lt("updated_at", staleBefore);
  if (recoverError) throw new Error(`Could not recover interrupted refund customer updates: ${recoverError.message}`);
  const { data: updates, error } = await db.from("refund_customer_updates")
    .select("id,event_status,attempt,refund:refunds!inner(id,merchant_id,payment_id,amount,asset,network,destination,tx_hash,customer_email)")
    .eq("status", "PENDING").lte("next_attempt_at", now).order("created_at").limit(limit);
  if (error) throw new Error(`Could not load queued refund customer updates: ${error.message}`);

  let sent = 0;
  let failed = 0;
  for (const update of updates ?? []) {
    const attempt = update.attempt + 1;
    const { data: claimed, error: claimError } = await db.from("refund_customer_updates")
      .update({ status: "SENDING", attempt, updated_at: new Date().toISOString() }).eq("id", update.id).eq("status", "PENDING").select("id").maybeSingle();
    if (claimError) throw new Error(`Could not claim refund customer update: ${claimError.message}`);
    if (!claimed) continue;

    const refund = update.refund as any;
    try {
      const { data: profile, error: profileError } = await db.from("profiles")
        .select("business_name").eq("id", refund.merchant_id).maybeSingle();
      if (profileError) throw new Error(`Could not load merchant profile: ${profileError.message}`);
      const content = refundUpdateEmail(refund, profile?.business_name ?? "Your merchant", update.event_status);
      await sendEmail({ to: refund.customer_email, ...content });
      const { error: updateError } = await db.from("refund_customer_updates")
        .update({ status: "SENT", sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null }).eq("id", update.id);
      if (updateError) throw new Error(`Refund update was emailed, but its status could not be saved: ${updateError.message}`);
      sent++;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Refund customer update failed.";
      const retryAt = new Date(Date.now() + Math.min(60, 5 * 2 ** (attempt - 1)) * 60_000).toISOString();
      const finalAttempt = attempt >= MAX_ATTEMPTS;
      const { error: updateError } = await db.from("refund_customer_updates").update({
        status: finalAttempt ? "FAILED" : "PENDING",
        next_attempt_at: retryAt,
        updated_at: new Date().toISOString(),
        last_error: message.slice(0, 300),
      }).eq("id", update.id);
      if (updateError) throw new Error(`Could not record refund customer update failure: ${updateError.message}`);
      if (finalAttempt) {
        const finalMessage = `Refund customer update ${update.id} failed after ${attempt} attempts: ${message}`;
        const { error: notificationError } = await db.from("notifications").insert({
          merchant_id: refund.merchant_id, type: "refund.email_failed",
          body: `A refund status email for payment ${refund.payment_id} could not be delivered.`,
        });
        if (notificationError) throw new Error(`Could not notify merchant about the failed refund email: ${notificationError.message}`);
        await recordOperationalEvent({
          source: "refund_customer_update", severity: "error", message: finalMessage,
          details: { refund_id: refund.id, payment_id: refund.payment_id, event_status: update.event_status },
          fingerprint: `refund_customer_update:${update.id}`,
        });
      }
      failed++;
    }
  }
  return { sent, failed };
}
