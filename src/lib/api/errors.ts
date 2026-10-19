import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHORIZED" | "INVALID_API_KEY" | "INVALID_AMOUNT" | "INVALID_ASSET"
  | "INVALID_NETWORK" | "UNSUPPORTED_ASSET_NETWORK" | "INVALID_WALLET_ADDRESS"
  | "PAYMENT_NOT_FOUND" | "INVOICE_NOT_FOUND" | "PAYMENT_EXPIRED" | "RATE_LIMITED"
  | "VALIDATION_ERROR" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR";

export function apiError(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function apiAuthError(ctx: {
  rateLimited?: boolean;
  retryAfter?: number;
} | null) {
  if (!ctx) return apiError("INVALID_API_KEY", "Missing or invalid API key.", 401);
  if (ctx.rateLimited) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "API request limit exceeded. Retry after the indicated delay." } },
      { status: 429, headers: { "retry-after": String(ctx.retryAfter ?? 60) } },
    );
  }
  return null;
}
