import assert from "node:assert/strict";
import { parseRefundAmount } from "./amount";

assert.equal(parseRefundAmount("1.25", 6), 1_250_000n);
assert.equal(parseRefundAmount(".5", 6), 500_000n);
assert.equal(parseRefundAmount("0.000001", 6), 1n);
assert.equal(parseRefundAmount("0", 6), null);
assert.equal(parseRefundAmount("-1", 6), null);
assert.equal(parseRefundAmount("1e2", 6), null);
assert.equal(parseRefundAmount("1.0000001", 6), null);
console.log("refund amounts: ok");
