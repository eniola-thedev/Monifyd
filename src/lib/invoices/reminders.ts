import { adminClient } from "@/lib/supabase/admin";
import { invoiceReminderEmail } from "@/lib/email/invoice-reminder";
import { sendEmail } from "@/lib/email/send";
import { recordOperationalEvent } from "@/lib/operations/events";
import { activePlan } from "@/lib/billing/plans";

const MAX_ATTEMPTS = 3;

export async function processDueInvoiceReminders(limit = 50) {
  const db = adminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: dueInvoices, error: invoiceError } = await db.from("invoices")
    .select("id,merchant_id,invoice_number,customer_email,customer_name,title,amount_cents,currency,due_date")
    .in("status", ["SENT", "AWAITING_PAYMENT"])
    .in("due_date", [today, threeDaysFromNow]);
  if (invoiceError) throw new Error(`Could not load invoices due for reminders: ${invoiceError.message}`);

  const merchantIds = [...new Set((dueInvoices ?? []).map((invoice: any) => invoice.merchant_id))];
  const eligibleMerchantIds = new Set<string>();
  if (merchantIds.length) {
    const { data: subscriptions, error } = await db.from("merchant_subscriptions")
      .select("merchant_id,plan,status,current_period_end").in("merchant_id", merchantIds);
    if (error) throw new Error(`Could not check invoice reminder entitlements: ${error.message}`);
    for (const subscription of subscriptions ?? []) {
      if (activePlan(subscription) !== "FREE") eligibleMerchantIds.add(subscription.merchant_id);
    }
  }

  const eligible = (dueInvoices ?? []).filter((invoice: any) => eligibleMerchantIds.has(invoice.merchant_id)).flatMap((invoice: any) => [
    ...(invoice.due_date === threeDaysFromNow ? [{ invoice_id: invoice.id, reminder_type: "three_days_before" }] : []),
    ...(invoice.due_date === today ? [{ invoice_id: invoice.id, reminder_type: "due_today" }] : []),
  ]);
  if (eligible.length) {
    const { error: insertError } = await db.from("invoice_reminders")
      .upsert(eligible, { onConflict: "invoice_id,reminder_type", ignoreDuplicates: true });
    if (insertError) throw new Error(`Could not queue invoice reminders: ${insertError.message}`);
  }

  const { data: reminders, error: reminderError } = await db.from("invoice_reminders")
    .select("id,invoice_id,reminder_type,attempt,invoice:invoices!inner(id,merchant_id,invoice_number,customer_email,customer_name,title,amount_cents,currency,due_date,status)")
    .eq("status", "PENDING").lte("next_attempt_at", now.toISOString())
    .order("created_at").limit(limit);
  if (reminderError) throw new Error(`Could not load queued invoice reminders: ${reminderError.message}`);
  let sent = 0;
  let failed = 0;
  for (const reminder of reminders ?? []) {
    const { data: claimed, error: claimError } = await db.from("invoice_reminders")
      .update({ status: "SENDING", attempt: reminder.attempt + 1 })
      .eq("id", reminder.id).eq("status", "PENDING").select("id").maybeSingle();
    if (claimError) throw new Error(`Could not claim an invoice reminder: ${claimError.message}`);
    if (!claimed) continue;

    const invoice = reminder.invoice as any;
    const { data: subscription, error: subscriptionError } = await db.from("merchant_subscriptions")
      .select("plan,status,current_period_end").eq("merchant_id", invoice.merchant_id).maybeSingle();
    if (subscriptionError) throw new Error(`Could not check invoice reminder entitlement: ${subscriptionError.message}`);
    if (activePlan(subscription) === "FREE") {
      const { error } = await db.from("invoice_reminders").update({ status: "SKIPPED" }).eq("id", reminder.id);
      if (error) throw new Error(`Could not skip a reminder for a Free plan: ${error.message}`);
      continue;
    }
    if (!["SENT", "AWAITING_PAYMENT"].includes(invoice.status)) {
      const { error } = await db.from("invoice_reminders").update({ status: "SKIPPED" }).eq("id", reminder.id);
      if (error) throw new Error(`Could not skip a reminder for a closed invoice: ${error.message}`);
      continue;
    }
    try {
      const { data: profile, error: profileError } = await db.from("profiles")
        .select("business_name").eq("id", invoice.merchant_id).maybeSingle();
      if (profileError) throw new Error(`Could not load merchant profile: ${profileError.message}`);
      const content = invoiceReminderEmail(invoice, profile?.business_name ?? "Your merchant", reminder.reminder_type === "due_today");
      await sendEmail({ to: invoice.customer_email, ...content });
      const { error } = await db.from("invoice_reminders")
        .update({ status: "SENT", sent_at: new Date().toISOString(), last_error: null }).eq("id", reminder.id);
      if (error) throw new Error(`Reminder was sent, but its status could not be saved: ${error.message}`);
      sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invoice reminder delivery failed.";
      const attempt = reminder.attempt + 1;
      const retryAt = new Date(Date.now() + Math.min(60, 5 * 2 ** (attempt - 1)) * 60_000).toISOString();
      const { error: updateError } = await db.from("invoice_reminders").update({
        status: attempt >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        next_attempt_at: retryAt,
        last_error: message.slice(0, 300),
      }).eq("id", reminder.id);
      if (updateError) throw new Error(`Could not record invoice reminder failure: ${updateError.message}`);
      if (attempt >= MAX_ATTEMPTS) {
        const finalMessage = `Invoice reminder for ${reminder.invoice_id} failed after ${attempt} attempts: ${message}`;
        const { error: notificationError } = await db.from("notifications").insert({
          merchant_id: invoice.merchant_id, type: "invoice.reminder_failed",
          body: `A reminder for invoice ${invoice.invoice_number} could not be delivered.`,
        });
        if (notificationError) throw new Error(`Could not notify merchant about failed invoice reminder: ${notificationError.message}`);
        await recordOperationalEvent({
          source: "invoice_reminder", severity: "error", message: finalMessage,
          details: { invoice_id: reminder.invoice_id, reminder_type: reminder.reminder_type },
          fingerprint: `invoice_reminder:${reminder.id}`,
        });
      }
      failed++;
    }
  }
  return { sent, failed };
}
