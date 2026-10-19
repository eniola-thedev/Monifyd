import { createHmac, timingSafeEqual } from "node:crypto";

/** Signature covers `${timestamp}.${rawBody}`. Sent as X-Monifyd-Signature / X-Monifyd-Timestamp. */
export function signWebhook(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyWebhook(opts: {
  secret: string;
  timestamp: number;
  rawBody: string;
  signature: string;
  toleranceSeconds?: number;
}): boolean {
  const { secret, timestamp, rawBody, signature, toleranceSeconds = 300 } = opts;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhook(secret, timestamp, rawBody), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
