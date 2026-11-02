import type { SupabaseClient } from "@supabase/supabase-js";
import { FEE_CONFIG } from "@/config/fees";
import { processDomainEventOutbox } from "@/lib/webhooks/outbox";

export const ALLOWED: Record<string, string[]> = {
  CREATED: ["AWAITING_PAYMENT", "CANCELLED", "EXPIRED"],
  AWAITING_PAYMENT: ["PAYMENT_DETECTED", "EXPIRED", "CANCELLED", "FAILED"],
  PAYMENT_DETECTED: ["CONFIRMING", "UNDERPAID", "OVERPAID", "FAILED"],
  CONFIRMING: ["PAID", "UNDERPAID", "OVERPAID", "FAILED"],
  UNDERPAID: ["PAID", "EXPIRED"],
  EXPIRED: ["PAYMENT_DETECTED"], // a late payment the merchant assigned by hand
  OVERPAID: [], PAID: [], FAILED: [], CANCELLED: [],
};

/** Moves a payment and records its history and webhook outbox event in one database transaction. */
export async function transition(db: SupabaseClient, id: string, from: string, to: string, patch: Record<string, unknown> = {}): Promise<boolean> {
  if (!ALLOWED[from]?.includes(to)) return false;
  const { data, error } = await db.rpc("transition_payment_state", {
    p_payment_id: id,
    p_from_status: from,
    p_to_status: to,
    p_received_amount: patch.received_amount ?? null,
    p_confirmations: patch.confirmations ?? null,
  });
  if (error) throw new Error(`Could not transition payment ${id}: ${error.message}`);
  if (!data) return false;
  if (to !== "CANCELLED") await processDomainEventOutbox();
  return true;
}

/**
 * Writes the fee ledger row and marks the link or invoice as settled. Uses the fee stored on the payment.
 * Settlement and its event snapshots enter the transactional outbox together.
 */
export async function settle(
  db: SupabaseClient, pay: any, final: "PAID" | "OVERPAID" = "PAID",
  expectedStatus: "CONFIRMING" | "UNDERPAID" = "CONFIRMING", actor = "system", auditAction?: string,
): Promise<boolean> {
  const { data, error } = await db.rpc("settle_payment", {
    p_payment_id: pay.id,
    p_expected_status: expectedStatus,
    p_final_status: final,
    p_fixed_fee_cents: FEE_CONFIG.fixedFeeCents,
    p_actor: actor,
    p_audit_action: auditAction ?? null,
  });
  if (error) throw new Error(`Could not settle payment ${pay.id}: ${error.message}`);
  if (!data) return false;
  await processDomainEventOutbox();
  return true;
}
