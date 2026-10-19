import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.paystack.co";

export async function paystackPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Paystack billing is not configured. Add PAYSTACK_SECRET_KEY.");
  const response = await fetch(`${API}${path}`, {
    method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body), cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as { status?: boolean; message?: string; data?: T };
  if (!response.ok || !payload.status || !payload.data) throw new Error(`Paystack request failed (${response.status}): ${payload.message ?? response.statusText}`);
  return payload.data;
}

export function validPaystackSignature(rawBody: string, signature: string | null) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function paystackPlanEnvName(product: string, plan: string, interval: string) {
  return `PAYSTACK_PLAN_${product}_${plan}_NGN_${interval.toUpperCase()}`;
}
