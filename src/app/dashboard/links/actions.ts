"use server";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/session";
import { publicId } from "@/lib/security/ids";
import { toCents } from "@/lib/format";
import { parsePairs, validateAccepted } from "@/lib/payments/accepted";
import { fail, done } from "@/lib/flash";

const PATH = "/dashboard/links";

export async function createLink(fd: FormData) {
  const { user, authUser, supabase } = await requireEditor();
  const amountCents = toCents(fd.get("amount"));
  if (!amountCents) fail(PATH, "Enter an amount greater than 0.");
  const accepted = parsePairs(fd.getAll("pair").map(String));
  const problem = await validateAccepted(supabase, user.id, accepted);
  if (problem) fail(PATH, problem);
  const id = publicId("plink");
  const { error } = await supabase.from("payment_links").insert({
    id, merchant_id: user.id, amount_cents: amountCents, currency: "USD",
    description: String(fd.get("description") ?? "").trim() || null,
    reference: String(fd.get("reference") ?? "").trim() || null,
    accepted_payments: accepted,
  });
  if (error) fail(PATH, "Could not create the payment link.");
  await supabase.from("audit_logs").insert({ merchant_id: user.id, actor: authUser.id, action: "payment_link.created", target: id });
  revalidatePath(PATH);
  done(PATH, "Payment link created. Copy it from the table below.");
}

export async function disableLink(fd: FormData) {
  const { user, supabase } = await requireEditor();
  await supabase.from("payment_links").update({ status: "DISABLED" }).eq("id", String(fd.get("id"))).eq("merchant_id", user.id);
  revalidatePath(PATH);
  done(PATH, "Payment link disabled.");
}
