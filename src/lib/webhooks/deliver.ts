import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { adminClient } from "@/lib/supabase/admin";
import { signWebhook } from "@/lib/security/webhook-signature";
import { decryptWebhookSecret } from "@/lib/security/webhook-secrets";
import { isPrivateIp, nextDelaySeconds } from "./rules";
import { recordOperationalEvent } from "@/lib/operations/events";

/** Resolves and validates once, then pins the HTTPS connection to that public IP to prevent DNS rebinding. */
async function postWebhook(rawUrl: string, body: string, headers: Record<string, string>) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Webhook endpoints must use HTTPS.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error("The endpoint resolves to a private address.");
  }
  const pinned = addresses[0];
  return new Promise<number>((resolve, reject) => {
    const req = httpsRequest({
      hostname: host,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers,
      lookup: (_hostname, options, callback) => {
        if (typeof options === "object" && options.all) callback(null, addresses);
        else callback(null, pinned.address, pinned.family);
      },
    }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.setTimeout(8_000, () => req.destroy(new Error("Webhook request timed out.")));
    req.on("error", reject);
    req.end(body);
  });
}

/**
 * Makes one delivery attempt. The row is claimed first, so the scheduler and an immediate send never both fire.
 * Success is any 2xx response. Failures retry with growing delays and are marked FAILED after the 7th.
 */
export async function attemptDelivery(id: string) {
  const db = adminClient();
  const now = new Date();
  const { data: d, error: claimError } = await db.from("webhook_deliveries")
    .update({ next_attempt_at: new Date(now.getTime() + 120_000).toISOString() })
    .eq("id", id).eq("status", "PENDING").lte("next_attempt_at", now.toISOString()).select("*").maybeSingle();
  if (claimError) throw new Error(`Could not claim webhook delivery ${id}: ${claimError.message}`);
  if (!d) return;
  const { data: ep, error: endpointError } = await db.from("webhook_endpoints").select("*").eq("id", d.endpoint_id).maybeSingle();
  if (endpointError) throw new Error(`Could not load webhook endpoint ${d.endpoint_id}: ${endpointError.message}`);
  if (!ep) return;

  const body = JSON.stringify(d.payload);
  const ts = Math.floor(Date.now() / 1000);
  let code: number | null = null;
  let error: string | null = null;
  try {
    const secret = decryptWebhookSecret(ep.secret);
    code = await postWebhook(ep.url, body, {
      "content-type": "application/json", "user-agent": "Monifyd-Webhooks/1.0",
      "x-monifyd-event-id": d.event_id, "x-monifyd-timestamp": String(ts),
      "x-monifyd-signature": signWebhook(secret, ts, body),
    });
    if (code < 200 || code >= 300) error = `Your server responded with HTTP ${code}.`;
  } catch (e) {
    error = e instanceof Error ? e.message : "The request failed.";
  }

  const attempt = d.attempt + 1;
  const delay = error === null ? null : nextDelaySeconds(attempt);
  const { error: updateError } = await db.from("webhook_deliveries").update({
    attempt, response_code: code, error: error ? error.slice(0, 300) : null, last_attempt_at: new Date().toISOString(),
    status: error === null ? "DELIVERED" : delay === null ? "FAILED" : "PENDING",
    next_attempt_at: delay === null ? null : new Date(Date.now() + delay * 1000).toISOString(),
  }).eq("id", id);
  if (updateError) throw new Error(`Could not save webhook delivery result: ${updateError.message}`);

  if (error !== null && delay === null) {
    const message = `Webhook ${d.event_type} to ${new URL(ep.url).host} failed after ${attempt} attempts.`;
    const { error: notificationError } = await db.from("notifications").insert({ merchant_id: ep.merchant_id, type: "webhook.failed", body: message });
    if (notificationError) throw new Error(`Webhook failed and merchant notification could not be saved: ${notificationError.message}`);
    await recordOperationalEvent({
      source: "webhook_delivery", severity: "error", message,
      details: { delivery_id: id, event_type: d.event_type, response_code: code, error },
      fingerprint: `webhook_delivery:${id}`,
    });
  }
}

/** Sends every delivery whose retry time has arrived. Run by the scheduler. */
export async function processDueDeliveries(limit = 25): Promise<number> {
  const db = adminClient();
  const { data, error } = await db.from("webhook_deliveries").select("id").eq("status", "PENDING")
    .lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
  if (error) throw new Error(`Could not load due webhook deliveries: ${error.message}`);
  const results = await Promise.allSettled((data ?? []).map((r: any) => attemptDelivery(r.id)));
  for (const result of results) {
    if (result.status === "rejected") {
      await recordOperationalEvent({
        source: "webhook_delivery", severity: "warning",
        message: result.reason instanceof Error ? result.reason.message : "Webhook delivery attempt failed.",
        fingerprint: "webhook_delivery:attempt",
      });
    }
  }
  return data?.length ?? 0;
}
