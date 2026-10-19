import { headers } from "next/headers";
import type { BillingCurrency } from "@/lib/billing/plans";

export type BillingLocation = { country: string; currency: BillingCurrency };

/** Uses geo headers added by the trusted hosting edge; unknown locations default to Nigeria. */
export async function billingLocation(): Promise<BillingLocation> {
  const requestHeaders = await headers();
  const rawCountry = requestHeaders.get("x-vercel-ip-country") ?? requestHeaders.get("cf-ipcountry");
  const country = rawCountry && /^[A-Za-z]{2}$/.test(rawCountry) ? rawCountry.toUpperCase() : "NG";
  return { country, currency: country === "NG" ? "NGN" : "USD" };
}

export function availableBillingIntervals(currency: BillingCurrency) {
  return ["monthly", "annually"] as const;
}
