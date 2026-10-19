import assert from "node:assert/strict";
import { calculateFee } from "./calculate";

const r = calculateFee(50_000); // $500.00 requested by the merchant
assert.equal(r.percentageFeeCents, 0);
assert.equal(r.fixedFeeCents, 0);
assert.equal(r.customerTotalCents, 50_000); // no fee is added to the requested amount
assert.equal(r.merchantCents, 50_000); // merchant receives the full $500.00
assert.throws(() => calculateFee(0));
assert.throws(() => calculateFee(10.5));
console.log("fees: ok ($500 request -> customer pays $500.00)");
