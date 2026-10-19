import assert from "node:assert/strict";
import { signWebhook, verifyWebhook } from "../security/webhook-signature";
import { isPrivateIp, nextDelaySeconds, validateWebhookUrl, MAX_ATTEMPTS } from "./rules";

// signing round trip
const now = Math.floor(Date.now() / 1000);
const body = JSON.stringify({ id: "evt_1", type: "payment.paid" });
const sig = signWebhook("whsec_x", now, body);
assert.ok(verifyWebhook({ secret: "whsec_x", timestamp: now, rawBody: body, signature: sig }));
assert.ok(!verifyWebhook({ secret: "whsec_x", timestamp: now, rawBody: body + " ", signature: sig }), "tampered body");
assert.ok(!verifyWebhook({ secret: "whsec_y", timestamp: now, rawBody: body, signature: sig }), "wrong secret");
assert.ok(!verifyWebhook({ secret: "whsec_x", timestamp: now - 1000, rawBody: body, signature: signWebhook("whsec_x", now - 1000, body) }), "too old");

// retry schedule: 6 delays, the 7th failure is final
assert.deepEqual([1, 2, 3, 4, 5, 6].map(nextDelaySeconds), [60, 300, 1800, 7200, 21600, 86400]);
assert.equal(nextDelaySeconds(MAX_ATTEMPTS), null);

// private address detection
for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert.ok(isPrivateIp(ip), ip);
for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) assert.ok(!isPrivateIp(ip), ip);

// url rules
assert.equal(validateWebhookUrl("https://example.com/hooks"), null);
for (const u of ["http://example.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "https://user:pw@example.com/x", "not a url", "https://[::1]/x"]) assert.notEqual(validateWebhookUrl(u), null, u);
console.log("webhooks: ok");
