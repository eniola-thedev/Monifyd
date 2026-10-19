import assert from "node:assert/strict";
import { refundUpdateEmail } from "./refund-update";

const refund = {
  payment_id: "pay_123",
  amount: "1.25",
  asset: "USDC",
  network: "base",
  destination: "<script>alert(1)</script>",
  tx_hash: "0xabc",
};

const sent = refundUpdateEmail(refund, "Merchant & Co", "SENT");
assert.match(sent.subject, /Your refund has been sent/);
assert.match(sent.html, /&lt;script&gt;/);
assert.doesNotMatch(sent.html, /<script>/);
assert.match(sent.html, /Transaction: <code>0xabc<\/code>/);

const failed = refundUpdateEmail({ ...refund, tx_hash: null }, "Merchant", "FAILED");
assert.match(failed.subject, /update about your refund/);
assert.doesNotMatch(failed.html, /Transaction:/);
console.log("refund customer email: ok");
