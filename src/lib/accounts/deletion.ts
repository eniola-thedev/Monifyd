import { adminClient } from "@/lib/supabase/admin";

/** Permanently removes due auth users; Supabase cascades deletion through their owned data. */
export async function processDueAccountDeletions(limit = 25): Promise<{ deleted: number; failed: number }> {
  const db = adminClient();
  const { data: claims, error: claimError } = await db.rpc("claim_due_account_deletions", { p_limit: limit });
  if (claimError) throw new Error(`Could not claim due account deletions: ${claimError.message}`);

  let deleted = 0;
  let failed = 0;
  for (const claim of claims ?? []) {
    const userId = String(claim.user_id);
    const { error } = await db.auth.admin.deleteUser(userId);
    if (!error) {
      deleted++;
      continue;
    }

    const { error: releaseError } = await db.from("account_deletions")
      .update({ claimed_until: null }).eq("user_id", userId);
    if (releaseError) throw new Error(`Account deletion failed and its claim could not be released: ${releaseError.message}`);
    failed++;
  }
  return { deleted, failed };
}
