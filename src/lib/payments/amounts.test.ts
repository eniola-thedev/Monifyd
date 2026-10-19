import assert from "node:assert/strict";
import { toBase, fromBase, quoteUnits, dustFor, compareUnits, confirmedTotal, paymentOutcome, inAutoMatchBand } from "./amounts";

assert.equal(toBase("501.45", 6), 501_450_000n);
assert.equal(fromBase(501_450_123n, 6), "501.450123");
assert.equal(fromBase(5n, 8), "0.00000005");
assert.equal(toBase("0.00501", 8), 501_000n);
assert.equal(quoteUnits(50_145, 1, 6, 7n), 501_450_007n); // $501.45 of a $1 coin plus 7 units of dust
assert.equal(quoteUnits(50_145, 100_000, 8, 10n), 501_450n + 10n); // 0.0050145 BTC plus 10 sats
const d = dustFor("USDC", 6); assert.ok(d >= 1n && d <= 999n);
const w = dustFor("USDT", 18); assert.ok(w >= 10n ** 6n && w <= 999n * 10n ** 12n);
assert.equal(compareUnits(100n, 100n), "PAID");
assert.equal(compareUnits(99n, 100n), "UNDERPAID");
assert.equal(compareUnits(101n, 100n), "OVERPAID");
assert.equal(confirmedTotal([
  { amount: "0.4", confirmations: 12 },
  { amount: "0.6", confirmations: 11 },
  { amount: "0.6", confirmations: 32 },
], 1, 12), 10n);
assert.equal(paymentOutcome(100n, 100n, false, true), "PAID");
assert.equal(paymentOutcome(120n, 100n, false, true), "OVERPAID");
assert.equal(paymentOutcome(50n, 100n, false, true), null);
assert.equal(paymentOutcome(100n, 100n, false, false), "PAID");
assert.equal(paymentOutcome(50n, 100n, true, false), null);
assert.equal(paymentOutcome(50n, 100n, true, true), "UNDERPAID");
assert.ok(inAutoMatchBand(500n, 1000n) && inAutoMatchBand(1000n, 1000n) && inAutoMatchBand(3000n, 1000n) && inAutoMatchBand(10n, 1000n));
assert.ok(!inAutoMatchBand(9n, 1000n) && !inAutoMatchBand(3001n, 1000n));
assert.equal(compareUnits(toBase("501.450123", 18), toBase("501.450123", 18)), "PAID"); // 18-decimal values stay exact
console.log("amounts: ok");
