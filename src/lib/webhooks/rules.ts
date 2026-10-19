import { BlockList, isIP } from "node:net";

export const EVENT_TYPES = [
  "payment.created", "payment.detected", "payment.confirming", "payment.partial", "payment.paid", "payment.underpaid",
  "payment.overpaid", "payment.expired", "payment.failed",
  "invoice.created", "invoice.sent", "invoice.paid", "invoice.underpaid", "invoice.overpaid", "invoice.cancelled",
] as const;

/** Seconds to wait after failed attempt 1, 2, 3 ... The 7th failure is final. */
const DELAYS = [60, 300, 1800, 7200, 21600, 86400];
export const MAX_ATTEMPTS = 7;

export function nextDelaySeconds(attemptsMade: number): number | null {
  return attemptsMade >= MAX_ATTEMPTS ? null : DELAYS[attemptsMade - 1];
}

const blockedAddresses = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedAddresses.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blockedAddresses.addSubnet(address, prefix, "ipv6");

/** True for private, loopback, link-local, multicast, documentation and reserved addresses. */
export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  return family === 0 || blockedAddresses.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/** Returns an error message, or null when the URL is acceptable as a webhook endpoint. */
export function validateWebhookUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return "Enter a full URL, for example https://example.com/webhooks/monifyd"; }
  if (raw.length > 500) return "That URL is too long.";
  if (u.username || u.password) return "Remove the username and password from the URL.";
  if (u.protocol !== "https:") return "The URL must start with https://";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return "That address is not reachable from the internet.";
  if (isIP(host) && isPrivateIp(host)) return "That address is not reachable from the internet.";
  return null;
}
