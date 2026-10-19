"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";

export async function markNotificationsRead() {
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("merchant_id", user.id).is("read_at", null);
  if (error) throw new Error(`Could not mark notifications as read: ${error.message}`);
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard", "layout");
}
