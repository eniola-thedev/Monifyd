import { NextResponse } from "next/server";
import { runDetection } from "@/lib/payments/detect";
import { processDueDeliveries } from "@/lib/webhooks/deliver";
import { processDomainEventOutbox } from "@/lib/webhooks/outbox";
import { processDueInvoiceReminders } from "@/lib/invoices/reminders";
import { processDueRefundCustomerUpdates } from "@/lib/refunds/updates";
import { recordOperationalEvent, resolveOperationalEvent } from "@/lib/operations/events";
import { adminClient } from "@/lib/supabase/admin";
import { processDueAccountDeletions } from "@/lib/accounts/deletion";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Run every minute by a scheduler. Requires `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const failures: string[] = [];
  let detection = { groups: 0, matched: 0, paid: 0, underpaid: 0, unmatched: 0, errors: [] as string[] };
  let webhooksSent = 0;
  let domainEventsDispatched = 0;
  let invoiceReminders = { sent: 0, failed: 0 };
  let refundCustomerUpdates = { sent: 0, failed: 0 };
  let accountDeletions = { deleted: 0, failed: 0 };
  try {
    detection = await runDetection();
    for (const error of detection.errors) {
      failures.push(error);
      await recordOperationalEvent({
        source: "chain_detection", severity: "error", message: error,
        details: { error }, fingerprint: `chain_detection:${error.split(":")[0]}`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment detection failed.";
    failures.push(message);
    await recordOperationalEvent({ source: "chain_detection", severity: "critical", message, fingerprint: "chain_detection:worker" });
  }
  try { webhooksSent = await processDueDeliveries(); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Webhook delivery processing failed.";
    failures.push(message);
    await recordOperationalEvent({ source: "webhooks", severity: "error", message, fingerprint: "webhooks:worker" });
  }
  try { domainEventsDispatched = await processDomainEventOutbox(); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Domain event outbox processing failed.";
    failures.push(message);
    await recordOperationalEvent({ source: "domain_event_outbox", severity: "error", message, fingerprint: "domain_event_outbox:worker" });
  }
  try { invoiceReminders = await processDueInvoiceReminders(); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Invoice reminder processing failed.";
    failures.push(message);
    await recordOperationalEvent({ source: "invoice_reminders", severity: "error", message, fingerprint: "invoice_reminders:worker" });
  }
  try { refundCustomerUpdates = await processDueRefundCustomerUpdates(); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Refund customer update processing failed.";
    failures.push(message);
    await recordOperationalEvent({ source: "refund_customer_update", severity: "error", message, fingerprint: "refund_customer_update:worker" });
  }
  try {
    accountDeletions = await processDueAccountDeletions();
    if (accountDeletions.failed) failures.push(`${accountDeletions.failed} account deletion(s) could not be completed; they will be retried.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account deletion processing failed.";
    failures.push(message);
    await recordOperationalEvent({ source: "account_deletion", severity: "critical", message, fingerprint: "account_deletion:worker" });
  }
  try {
    const { error } = await adminClient().rpc("cleanup_api_state");
    if (error) throw new Error(error.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "API state cleanup failed.";
    failures.push(message);
    await recordOperationalEvent({ source: "api_cleanup", severity: "warning", message, fingerprint: "api_cleanup:worker" });
  }
  try {
    const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: stale, error } = await adminClient().from("payments")
      .select("id,merchant_id,network,asset,detected_at").eq("livemode", true)
      .eq("status", "CONFIRMING").lt("detected_at", staleBefore).limit(500);
    if (error) throw new Error(`Could not check for stalled confirmations: ${error.message}`);
    const staleIds = new Set((stale ?? []).map((payment: any) => payment.id));
    for (const payment of stale ?? []) {
      await recordOperationalEvent({
        source: "stalled_payment", severity: "warning",
        message: `Payment ${payment.id} has remained in confirmation for more than 30 minutes.`,
        details: { payment_id: payment.id, network: payment.network, asset: payment.asset, detected_at: payment.detected_at },
        fingerprint: `stalled_payment:${payment.id}`,
      });
    }
    const { data: alerts, error: alertError } = await adminClient().from("operational_events")
      .select("id,details").eq("source", "stalled_payment").is("resolved_at", null).limit(1000);
    if (alertError) throw new Error(`Could not reconcile stalled-payment alerts: ${alertError.message}`);
    for (const alert of alerts ?? []) {
      const paymentId = String((alert.details as Record<string, unknown>)?.payment_id ?? "");
      if (paymentId && !staleIds.has(paymentId)) await resolveOperationalEvent(`stalled_payment:${paymentId}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirmation monitoring failed.";
    failures.push(message);
    await recordOperationalEvent({ source: "confirmation_monitor", severity: "error", message, fingerprint: "confirmation_monitor:worker" });
  }
  return NextResponse.json(
    { ...detection, webhooksSent, domainEventsDispatched, invoiceReminders, refundCustomerUpdates, accountDeletions, errors: failures },
    { status: failures.length ? 500 : 200 },
  );
}
