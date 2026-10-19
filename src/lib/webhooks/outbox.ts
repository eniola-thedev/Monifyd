import { adminClient } from "@/lib/supabase/admin";
import { paymentData, invoiceData } from "@/lib/webhooks/payload";
import { emitEvent } from "@/lib/webhooks/emit";
import { recordOperationalEvent } from "@/lib/operations/events";

export async function processDomainEventOutbox(limit = 10) {
  const db = adminClient();
  const { data, error } = await db.rpc("claim_domain_event_outbox", { p_limit: limit });
  if (error) throw new Error(`Could not claim domain events: ${error.message}`);
  let dispatched = 0;
  for (const event of data ?? []) {
    try {
      const payloadData = event.data_type === "payment"
        ? await paymentData(db, event.event_data)
        : invoiceData(event.event_data);
      if (!(await emitEvent(event.merchant_id, event.event_type, payloadData, undefined, event.event_id))) {
        throw new Error("Webhook deliveries could not be queued.");
      }
      const { error: updateError } = await db.from("domain_event_outbox").update({
        dispatched_at: new Date().toISOString(), claimed_until: null, last_error: null,
      }).eq("id", event.id).is("dispatched_at", null);
      if (updateError) throw new Error(`Could not mark domain event ${event.event_id} as dispatched: ${updateError.message}`);
      dispatched++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Domain event dispatch failed.";
      const delaySeconds = Math.min(86_400, 60 * 2 ** Math.min(Number(event.attempts ?? 1) - 1, 10));
      await db.from("domain_event_outbox").update({
        claimed_until: null,
        next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
        last_error: message.slice(0, 300),
      }).eq("id", event.id).is("dispatched_at", null);
      try {
        await recordOperationalEvent({
          source: "domain_event_outbox", severity: "error", message,
          details: { event_id: event.event_id, event_type: event.event_type },
          fingerprint: `domain_event_outbox:${event.event_id}`,
        });
      } catch { /* The outbox claim expires and the event is retried even if alert recording fails. */ }
    }
  }
  return dispatched;
}
