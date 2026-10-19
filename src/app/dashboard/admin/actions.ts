"use server";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { fail, done } from "@/lib/flash";

const PATH = "/dashboard/admin";

export async function setMerchantSuspension(fd: FormData) {
  const { authUser } = await requireAdmin();
  const merchantId = String(fd.get("merchant_id") ?? "");
  const suspend = fd.get("suspend") === "1";
  if (!merchantId || merchantId === authUser.id) fail(PATH, "You cannot change this merchant's suspension.");

  const db = adminClient();
  const { data: merchant, error: lookupError } = await db.from("profiles")
    .select("id,role,business_name").eq("id", merchantId).maybeSingle();
  if (lookupError) fail(PATH, "Could not load that merchant.");
  if (!merchant || merchant.role !== "merchant") fail(PATH, "Only merchant accounts can be suspended.");

  const { error } = await db.from("profiles").update({
    suspended_at: suspend ? new Date().toISOString() : null,
  }).eq("id", merchantId);
  if (error) fail(PATH, "Could not update the merchant.");
  const { error: auditError } = await db.from("audit_logs").insert({
    merchant_id: merchantId, actor: authUser.id,
    action: suspend ? "merchant.suspended" : "merchant.reinstated",
    target: merchantId, details: { business_name: merchant.business_name },
  });
  if (auditError) fail(PATH, "Merchant status changed, but the audit record could not be saved.");
  revalidatePath(PATH);
  done(PATH, suspend ? "Merchant suspended." : "Merchant reinstated.");
}

export async function resolveOperationalEvent(fd: FormData) {
  const { authUser } = await requireAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) fail(PATH, "Choose a valid operational event.");
  const { error } = await adminClient().from("operational_events")
    .update({ resolved_at: new Date().toISOString() }).eq("id", id).is("resolved_at", null);
  if (error) fail(PATH, "Could not resolve the operational event.");
  const { error: auditError } = await adminClient().from("audit_logs").insert({
    merchant_id: null, actor: authUser.id, action: "operational_event.resolved", target: String(id),
  });
  if (auditError) fail(PATH, "Event resolved, but the audit record could not be saved.");
  revalidatePath(PATH);
  done(PATH, "Operational event resolved.");
}
