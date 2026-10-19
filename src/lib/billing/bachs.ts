import { createHmac, timingSafeEqual } from "node:crypto";

export function bachsApiBaseUrl() {
  return process.env.BACHS_ENVIRONMENT === "sandbox"
    ? "https://sandbox-api.bachs.io/v1"
    : "https://api.bachs.io/v1";
}

function bachsErrorMessage(rawBody: string, status: number, statusText: string) {
  let payload: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch {
    // Fall back to the raw response for non-JSON errors.
  }

  const error = payload?.error;
  const nestedError = error && typeof error === "object" && !Array.isArray(error)
    ? error as Record<string, unknown>
    : null;
  const detail = [
    typeof error === "string" ? error : null,
    typeof nestedError?.message === "string" ? nestedError.message : null,
    typeof nestedError?.detail === "string" ? nestedError.detail : null,
    typeof payload?.detail === "string" ? payload.detail : null,
    typeof payload?.message === "string" ? payload.message : null,
  ].find(Boolean);
  const errors = Array.isArray(payload?.errors)
    ? payload.errors.map((item) => {
      if (!item || typeof item !== "object") return String(item);
      const field = "field" in item && typeof item.field === "string" ? `${item.field}: ` : "";
      const message = "message" in item && typeof item.message === "string" ? item.message : JSON.stringify(item);
      return `${field}${message}`;
    }).join("; ")
    : "";
  const code = typeof payload?.error_code === "string" ? payload.error_code : "";
  const description = [detail, errors, code ? `code ${code}` : ""].filter(Boolean).join(" — ");
  return `BACHS request failed (${status}): ${description || rawBody.trim() || statusText}`;
}

export async function bachsPost<T>(path: string, body: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const key = process.env.BACHS_API_KEY;
  if (!key) throw new Error("BACHS billing is not configured. Add BACHS_API_KEY.");
  const response = await fetch(`${bachsApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const rawBody = await response.text();
  let result: { data?: T };
  try { result = JSON.parse(rawBody) as { data?: T }; }
  catch { result = {} as { data?: T }; }
  if (!response.ok) throw new Error(bachsErrorMessage(rawBody, response.status, response.statusText));
  return (result.data ?? result) as T;
}

export async function bachsDelete<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = process.env.BACHS_API_KEY;
  if (!key) throw new Error("BACHS billing is not configured. Add BACHS_API_KEY.");
  const response = await fetch(`${bachsApiBaseUrl()}${path}`, {
    method: "DELETE", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body), cache: "no-store",
  });
  const rawBody = await response.text();
  let result: { data?: T };
  try { result = JSON.parse(rawBody) as { data?: T }; }
  catch { result = {} as { data?: T }; }
  if (!response.ok) throw new Error(bachsErrorMessage(rawBody, response.status, response.statusText));
  return (result.data ?? result) as T;
}

export function bachsProductEnvName(product: string, plan: string, currency: string, interval: string) {
  return `BACHS_PRODUCT_${product}_${plan}_${currency}_${interval.toUpperCase()}`;
}

export function isBachsSignatureValid(rawBody: string, headers: Headers, secret: string, nowSeconds = Date.now() / 1000) {
  const v2 = headers.get("x-bachs-signature-v2");
  const legacySignature = headers.get("x-bachs-signature");
  const timestampHeader = headers.get("x-bachs-timestamp");
  let timestamp = timestampHeader;
  let signatures: string[] = [];
  if (v2) {
    const parts = v2.split(",").map((part) => part.trim().split("=", 2));
    timestamp = parts.find(([key]) => key === "t")?.[1] ?? timestamp;
    signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
  } else if (legacySignature) signatures = [legacySignature];
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  const sentAt = Number(timestamp);
  if (!Number.isSafeInteger(sentAt) || Math.abs(nowSeconds - sentAt) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return signatures.some((signature) => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
