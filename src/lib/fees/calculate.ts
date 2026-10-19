import { FEE_CONFIG } from "@/config/fees";

export type FeeBreakdown = {
  /** What the merchant asked for, and what the merchant receives. */
  amountCents: number;
  percentageFeeCents: number;
  fixedFeeCents: number;
  totalFeeCents: number;
  /** What the customer pays: amount + fee. */
  customerTotalCents: number;
  /** What the merchant receives (always equal to amountCents). */
  merchantCents: number;
};

/** Calculates the active transaction fee policy using integer cents. */
export function calculateFee(amountCents: number, config = FEE_CONFIG): FeeBreakdown {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new RangeError("amountCents must be a positive integer");
  }
  const percentageFeeCents = Math.round((amountCents * config.percentBasisPoints) / 10_000);
  const totalFeeCents = percentageFeeCents + config.fixedFeeCents;
  return {
    amountCents,
    percentageFeeCents,
    fixedFeeCents: config.fixedFeeCents,
    totalFeeCents,
    customerTotalCents: amountCents + totalFeeCents,
    merchantCents: amountCents,
  };
}
