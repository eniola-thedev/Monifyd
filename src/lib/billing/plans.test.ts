import assert from "node:assert/strict";
import { activePlan, apiEntitlements, apiPlanPrice, entitlements, planPrice } from "./plans";

assert.equal(planPrice("PRO", "NGN", "monthly"), 350_000);
assert.equal(planPrice("PRO", "NGN", "annually"), 3_350_000);
assert.equal(planPrice("BUSINESS", "NGN", "monthly"), 1_300_000);
assert.equal(planPrice("BUSINESS", "NGN", "annually"), 13_350_000);
assert.equal(planPrice("PRO", "USD", "monthly"), 900);
assert.equal(planPrice("BUSINESS", "USD", "monthly"), 2_900);
assert.equal(apiPlanPrice("GROWTH", "USD", "monthly"), 1_900);
assert.equal(apiPlanPrice("SCALE", "USD", "monthly"), 7_900);
assert.equal(apiEntitlements("FREE").writesPerMinute, 30);
assert.equal(apiEntitlements("GROWTH").webhookEndpoints, 10);
assert.equal(entitlements("BUSINESS").seats, 5);
assert.equal(activePlan({ plan: "BUSINESS", status: "ACTIVE" }), "BUSINESS");
assert.equal(activePlan({ plan: "PRO", status: "PAST_DUE", current_period_end: "2099-01-01T00:00:00Z" }), "PRO");
assert.equal(activePlan({ plan: "PRO", status: "PAST_DUE" }), "FREE");
assert.equal(activePlan({ plan: "BUSINESS", status: "ACTIVE", current_period_end: "2000-01-01T00:00:00Z" }), "FREE");
console.log("billing plans: ok");
