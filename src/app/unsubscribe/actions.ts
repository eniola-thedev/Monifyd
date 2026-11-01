"use server";

import { redirect } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function unsubscribeInvoiceReminders(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!TOKEN_PATTERN.test(token)) redirect("/unsubscribe/invalid");

  const { error } = await adminClient().from("invoice_reminder_unsubscribes")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("token", token)
    .is("unsubscribed_at", null);
  if (error) throw new Error(`Could not unsubscribe from invoice reminders: ${error.message}`);

  redirect(`/unsubscribe/${token}`);
}
