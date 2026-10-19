"use server";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/session";
import { adminClient } from "@/lib/supabase/admin";
import { generateApiKey } from "@/lib/security/api-keys";

export type KeyState = { key?: string; error?: string };

/** The full key is returned once and never stored. */
export async function createApiKey(_prev: KeyState, fd: FormData): Promise<KeyState> {
  const { user, authUser } = await requireEditor();
  const k = generateApiKey("live");
  const { error } = await adminClient().from("api_keys").insert({
    merchant_id: user.id, mode: "live", name: String(fd.get("name") ?? "").trim() || null,
    key_prefix: k.prefix, key_hash: k.hash,
  });
  if (error) return { error: "Could not create the key. Try again." };
  await adminClient().from("audit_logs").insert({ merchant_id: user.id, actor: authUser.id, action: "api_key.created", target: k.prefix });
  revalidatePath("/dashboard/developers");
  revalidatePath("/dashboard/settings");
  return { key: k.key };
}

export async function revokeApiKey(fd: FormData) {
  const { user, authUser } = await requireEditor();
  await adminClient().from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", String(fd.get("id"))).eq("merchant_id", user.id);
  await adminClient().from("audit_logs").insert({ merchant_id: user.id, actor: authUser.id, action: "api_key.revoked", target: String(fd.get("id")) });
  revalidatePath("/dashboard/developers");
  revalidatePath("/dashboard/settings");
}
