import assert from "node:assert/strict";
import { getClientIp, hashLoginLimitKey } from "./login-security";

assert.equal(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" })), "203.0.113.8");
assert.equal(getClientIp(new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.8" })), "203.0.113.9");
assert.equal(getClientIp(new Headers({ "cf-connecting-ip": "2001:db8::1" })), "2001:db8::1");
assert.equal(getClientIp(new Headers({ "x-forwarded-for": "not-an-ip" })), null);
assert.equal(getClientIp(new Headers()), null);

const emailKey = hashLoginLimitKey("email", "user@example.com", "test-secret");
assert.match(emailKey, /^[0-9a-f]{64}$/);
assert.equal(emailKey, hashLoginLimitKey("email", "user@example.com", "test-secret"));
assert.notEqual(emailKey, hashLoginLimitKey("ip", "user@example.com", "test-secret"));
assert.notEqual(emailKey, hashLoginLimitKey("email", "user@example.com", "another-secret"));

console.log("Login security tests passed.");
