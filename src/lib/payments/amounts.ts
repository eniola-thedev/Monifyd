import { randomInt } from "node:crypto";
import { toBase } from "./units";
export { fromBase, toBase } from "./units";

/**
 * Wallets are shared by all of a merchant's payments, so each open payment gets a tiny unique extra amount.
 * That is how a transfer is matched to exactly one payment. It is worth well under a cent for stablecoins.
 */
export function dustFor(asset: string, decimals: number): bigint {
  if (asset === "BTC") return BigInt(randomInt(1, 100)); // up to 99 sats
  if (decimals >= 12) return BigInt(randomInt(1, 1000)) * 10n ** BigInt(decimals - 6);
  return BigInt(randomInt(1, 1000));
}

/** Rounds the crypto amount up to base units, then adds the dust. */
export function quoteUnits(totalCents: number, usdRate: number, decimals: number, dust: bigint): bigint {
  const exact = totalCents / 100 / usdRate;
  const scaled = Math.ceil(exact * 10 ** Math.min(decimals, 8));
  const base = BigInt(scaled) * 10n ** BigInt(Math.max(0, decimals - 8));
  return base + dust;
}

/** What a confirmed payment amounts to, compared with what was asked for. */
export function compareUnits(received: bigint, expected: bigint): "PAID" | "UNDERPAID" | "OVERPAID" {
  return received === expected ? "PAID" : received < expected ? "UNDERPAID" : "OVERPAID";
}

/** Totals independently confirmed transfers without converting exact crypto amounts to floating point. */
export function confirmedTotal(transfers: { amount: string; confirmations: number }[], decimals: number, required: number): bigint {
  return transfers.reduce((sum, transfer) =>
    transfer.confirmations >= required ? sum + toBase(transfer.amount, decimals) : sum, 0n);
}

export function paymentOutcome(received: bigint, expected: bigint, quoteExpired: boolean, allTransfersConfirmed: boolean) {
  if (received >= expected) return compareUnits(received, expected);
  if (received > 0n && quoteExpired && allTransfersConfirmed) return "UNDERPAID" as const;
  return null;
}

/** For the opt-in automatic match of wrong amounts: from 1% to 300% of the amount asked for. */
export function inAutoMatchBand(received: bigint, expected: bigint): boolean {
  return received * 100n >= expected && received <= expected * 3n;
}
