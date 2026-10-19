"use server";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/session";
import { validateAddress } from "@/lib/blockchain/validate";
import { fail, done } from "@/lib/flash";

const PATH = "/dashboard/wallets";

export async function addWallet(fd: FormData) {
  const { user, authUser, supabase } = await requireEditor();
  const network = String(fd.get("network") ?? "");
  const address = String(fd.get("address") ?? "").trim();
  const label = String(fd.get("label") ?? "").trim() || null;
  if (!validateAddress(network, address)) fail(PATH, `That is not a valid ${network} address. Check it and try again.`);
  const { error } = await supabase.from("wallets").insert({ merchant_id: user.id, network, address, label });
  if (error) fail(PATH, error.code === "23505" ? "You already added that address for this network." : "Could not save the wallet.");
  await supabase.from("audit_logs").insert({ merchant_id: user.id, actor: authUser.id, action: "wallet.added", target: network });
  revalidatePath(PATH);
  done(PATH, "Wallet added.");
}

export async function removeWallet(fd: FormData) {
  const { user, authUser, supabase } = await requireEditor();
  const id = String(fd.get("id") ?? "");
  await supabase.from("wallets").delete().eq("id", id).eq("merchant_id", user.id);
  await supabase.from("audit_logs").insert({ merchant_id: user.id, actor: authUser.id, action: "wallet.removed", target: id });
  revalidatePath(PATH);
  done(PATH, "Wallet removed.");
}
