export type PaidPlan = "PRO" | "BUSINESS";
export type BillingInterval = "monthly" | "annually";
export type BillingCurrency = "NGN" | "USD";
export type PlanName = "FREE" | PaidPlan;
export type ApiPaidPlan = "GROWTH" | "SCALE";
export type ApiPlanName = "FREE" | ApiPaidPlan;

const prices = {
  PRO: { NGN: { monthly: 350_000, annually: 3_350_000 }, USD: { monthly: 900, annually: 9_000 } },
  BUSINESS: { NGN: { monthly: 1_300_000, annually: 13_350_000 }, USD: { monthly: 2_900, annually: 29_000 } },
} as const;

const apiPrices = {
  GROWTH: { NGN: { monthly: 1_000_000, annually: 10_000_000 }, USD: { monthly: 1_900, annually: 19_000 } },
  SCALE: { NGN: { monthly: 4_000_000, annually: 40_000_000 }, USD: { monthly: 7_900, annually: 79_000 } },
} as const;

const plans = {
  FREE: {
    name: "Free",
    seats: 1,
    advancedReports: false,
  },
  PRO: {
    name: "Pro",
    seats: 1,
    advancedReports: true,
  },
  BUSINESS: {
    name: "Business",
    seats: 5,
    advancedReports: true,
  },
} as const;

const apiPlans = {
  FREE: { readsPerMinute: 120, writesPerMinute: 30, webhookEndpoints: 2 },
  GROWTH: { readsPerMinute: 600, writesPerMinute: 150, webhookEndpoints: 10 },
  SCALE: { readsPerMinute: 2_400, writesPerMinute: 600, webhookEndpoints: 25 },
} as const;

export function planPrice(plan: PaidPlan, currency: BillingCurrency, interval: BillingInterval) {
  const price = prices[plan][currency][interval as keyof typeof prices[typeof plan][typeof currency]];
  if (price === undefined) throw new Error(`The ${currency} ${interval} price is not available for ${plan}.`);
  return price;
}


export function apiPlanPrice(plan: ApiPaidPlan, currency: BillingCurrency, interval: BillingInterval) {
  const price = apiPrices[plan][currency][interval as keyof typeof apiPrices[typeof plan][typeof currency]];
  if (price === undefined) throw new Error(`The ${currency} ${interval} price is not available for ${plan} API.`);
  return price;
}


export function activePlan(value?: {
  plan?: string | null;
  status?: string | null;
  current_period_end?: string | null;
} | null): PlanName {
  if (!value || !["ACTIVE", "PAST_DUE"].includes(value.status ?? "") || !value.plan || value.plan === "FREE") return "FREE";
  if (value.current_period_end && new Date(value.current_period_end).getTime() <= Date.now()) return "FREE";
  if (value.status === "PAST_DUE" && !value.current_period_end) return "FREE";
  return value.plan === "PRO" || value.plan === "BUSINESS" ? value.plan : "FREE";
}

export function entitlements(plan: PlanName) {
  return plans[plan];
}

export function apiEntitlements(plan: ApiPlanName) {
  return apiPlans[plan];
}

export function activeApiPlan(value?: {
  plan?: string | null;
  status?: string | null;
  current_period_end?: string | null;
} | null): ApiPlanName {
  if (!value || !["ACTIVE", "PAST_DUE"].includes(value.status ?? "") || !value.plan || value.plan === "FREE") return "FREE";
  if (value.current_period_end && new Date(value.current_period_end).getTime() <= Date.now()) return "FREE";
  if (value.status === "PAST_DUE" && !value.current_period_end) return "FREE";
  return value.plan === "GROWTH" || value.plan === "SCALE" ? value.plan : "FREE";
}

export function formatPlanPrice(amountMinor: number, currency: BillingCurrency) {
  return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export const planFeatures = {
  FREE: ["Payment links, invoices, checkout, and crypto payment tracking", "Basic payment history, monthly reports, and CSV exports", "One workspace owner", "Basic payment notifications"],
  PRO: ["Everything in Free", "Automated unpaid-invoice reminders", "Branded checkout pages", "Customer directory and payment history", "Advanced date-range, asset, network, and fee reports", "Detailed payment insights", "Saved invoice and payment-link templates"],
  BUSINESS: ["Everything in Pro", "Up to five seats with Owner, Admin, and Viewer roles", "Shared workspace", "Team activity and audit trail", "Multiple projects or stores", "Project-level permissions and settings", "Priority support"],
} as const;

export const apiPlanFeatures = {
  FREE: ["120 reads and 30 writes per minute", "Two webhook endpoints", "Payment links, invoices, and payment status", "Test environment and basic webhook logs"],
  GROWTH: ["Everything in Free", "600 reads and 150 writes per minute", "Ten webhook endpoints", "Signed webhooks with automatic delivery retries", "Idempotency keys for supported write operations", "Webhook replay and improved delivery logs"],
  SCALE: ["Everything in Growth", "2,400 reads and 600 writes per minute", "25 webhook endpoints", "Longer event-log retention", "Multiple scoped API keys", "Better monitoring and priority technical support"],
} as const;
