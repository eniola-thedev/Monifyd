import { adminClient } from "@/lib/supabase/admin";
import { publicId } from "@/lib/security/ids";
import { attemptDelivery } from "./deliver";
import { recordOperationalEvent } from "@/lib/operations/events";

/**
 * Records an event for every enabled endpoint of the merchant that subscribes to it, then tries to send it straight away.
 * Never throws: a webhook problem must not break payment processing. Failed sends are retried by the scheduler.
 * `onlyEndpointId` targets one endpoint and ignores its event filter (used for test events).
 */
export async function emitEvent(merchantId: string, type: string, data: unknown, onlyEndpointId?: string, stableEventId?: string): Promise<boolean> {
  try {
    const db = adminClient();
    let q = db.from("webhook_endpoints").select("id,events").eq("merchant_id", merchantId).eq("enabled", true);
    if (onlyEndpointId) q = q.eq("id", onlyEndpointId);
    const { data: eps, error: endpointError } = await q;
    if (endpointError) throw new Error(`Could not load webhook endpoints: ${endpointError.message}`);
    const targets = (eps ?? []).filter((e: any) => onlyEndpointId || e.events.length === 0 || e.events.includes(type));
    if (targets.length === 0) return true;
    const eventId = stableEventId ?? publicId("evt");
    const payload = { id: eventId, type, created: Math.floor(Date.now() / 1000), data };
    const { data: rows, error: insertError } = await db.from("webhook_deliveries").upsert(
      targets.map((e: any) => ({ endpoint_id: e.id, event_id: eventId, event_type: type, payload, next_attempt_at: new Date().toISOString() })),
      { onConflict: "endpoint_id,event_id", ignoreDuplicates: true },
    ).select("id");
    if (insertError) throw new Error(`Could not queue webhook deliveries: ${insertError.message}`);
    await Promise.allSettled((rows ?? []).map((r: any) => attemptDelivery(r.id)));
    return true;
  } catch {
    try {
      await recordOperationalEvent({
        source: "webhook_enqueue", severity: "error",
        message: `Could not queue ${type} webhook event for merchant ${merchantId}.`,
        details: { merchant_id: merchantId, event_type: type },
        fingerprint: `webhook_enqueue:${merchantId}:${type}`,
      });
    } catch { /* The outbox retries payment events if operational logging is also unavailable. */ }
    return false;
  }
}
