"use server";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/session";
import { publicId } from "@/lib/security/ids";
import { activePlan } from "@/lib/billing/plans";
import { DEFAULT_INVOICE_DESIGN, parseInvoiceDesign, type InvoiceDesign } from "@/lib/invoices/design";
import { adminClient } from "@/lib/supabase/admin";
import { parsePairs, validateAccepted } from "@/lib/payments/accepted";
import { sendInvoiceEmail } from "@/lib/invoices/send";
import { emitEvent } from "@/lib/webhooks/emit";
import { invoiceData } from "@/lib/webhooks/payload";
import { fail, done } from "@/lib/flash";

const PATH = "/dashboard/invoices";

async function storeInvoiceLogo(merchantId: string, file: File) {
  const allowedTypes: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  const extension = allowedTypes[file.type];
  if (!extension || file.size <= 0 || file.size > 524_288) fail(PATH, "Choose a PNG, JPEG, or WebP logo smaller than 512 KB.");
  const storage = adminClient().storage.from("invoice-logos");
  const path = `${merchantId}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await storage.upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (error || !data) fail(PATH, "Could not upload the logo. Choose another image and try again.");
  return storage.getPublicUrl(path).data.publicUrl;
}

export async function saveInvoicePreset(fd: FormData) {
  const { user, supabase } = await requireEditor();
  const { data: subscription, error: subscriptionError } = await adminClient().from("merchant_subscriptions")
    .select("plan,status,current_period_end").eq("merchant_id", user.id).maybeSingle();
  if (subscriptionError) fail(PATH, "Could not verify your plan. Try again.");
  if (activePlan(subscription) !== "BUSINESS") fail(PATH, "Saved design presets are available with Business.");
  const name = String(fd.get("preset_name") ?? "").trim().slice(0, 40);
  if (!name) fail(PATH, "Enter a name for this design preset.");
  let value: unknown;
  try { value = JSON.parse(String(fd.get("design") ?? "{}")); } catch { fail(PATH, "Invoice design is invalid. Reset the design and try again."); }
  const design = parseInvoiceDesign(value);
  const logoFile = fd.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) design.logoUrl = await storeInvoiceLogo(user.id, logoFile);
  else if (design.logoUrl === "pending-upload") design.logoUrl = "";
  const { data: profile, error: profileError } = await adminClient().from("profiles").select("invoice_design_presets")
    .eq("id", user.id).maybeSingle();
  if (profileError || !profile) fail(PATH, "Could not load saved design presets.");
  const presets = Array.isArray(profile.invoice_design_presets) ? profile.invoice_design_presets as { name: string; design: InvoiceDesign }[] : [];
  const existing = presets.findIndex((preset) => preset.name.toLowerCase() === name.toLowerCase());
  if (existing < 0 && presets.length >= 5) fail(PATH, "You can save up to five design presets. Replace a preset to save another.");
  if (existing >= 0) presets[existing] = { name, design };
  else presets.push({ name, design });
  const { error } = await adminClient().from("profiles").update({ invoice_design_presets: presets }).eq("id", user.id);
  if (error) fail(PATH, "Could not save the design preset. Try again.");
  revalidatePath(PATH);
  done(PATH, "Design preset saved.");
}

export async function createInvoice(fd: FormData) {
  const { user, authUser, supabase } = await requireEditor();
  const [{ data: subscription, error: subscriptionError }, { data: profile }] = await Promise.all([
    adminClient().from("merchant_subscriptions").select("plan,status,current_period_end").eq("merchant_id", user.id).maybeSingle(),
    adminClient().from("profiles").select("invoice_design,logo_url").eq("id", user.id).maybeSingle(),
  ]);
  if (subscriptionError) fail(PATH, "Could not verify your plan. Try again.");
  const plan = activePlan(subscription);
  let requestedDesign: unknown;
  let requestedItems: unknown;
  try { requestedDesign = JSON.parse(String(fd.get("design") ?? "{}")); } catch { fail(PATH, "Invoice design is invalid. Reset the design and try again."); }
  try { requestedItems = JSON.parse(String(fd.get("line_items") ?? "[]")); } catch { fail(PATH, "Invoice line items are invalid. Check the items and try again."); }
  const defaults = parseInvoiceDesign(profile?.invoice_design, { ...DEFAULT_INVOICE_DESIGN, logoUrl: profile?.logo_url ?? "" });
  let design = parseInvoiceDesign(requestedDesign, defaults);
  if (plan === "FREE") design = { ...DEFAULT_INVOICE_DESIGN, saveDefault: false };
  else if (plan === "PRO") design = { ...design, visible: DEFAULT_INVOICE_DESIGN.visible, order: DEFAULT_INVOICE_DESIGN.order };
  const logoFile = fd.get("logo");
  if (logoFile instanceof File && logoFile.size > 0 && plan === "FREE") fail(PATH, "Logo branding is part of Pro. View plans to upgrade.");
  if (logoFile instanceof File && logoFile.size > 0) design = { ...design, logoUrl: await storeInvoiceLogo(user.id, logoFile) };
  else if (design.logoUrl === "pending-upload") design = { ...design, logoUrl: defaults.logoUrl };
  if (plan === "PRO" && design.template !== "classic" && !["modern", "corporate", "creative"].includes(design.template)) {
    fail(PATH, "Choose a supported invoice template.");
  }
  const items = Array.isArray(requestedItems) ? requestedItems.slice(0, 50).map((entry: any) => {
    const description = typeof entry?.description === "string" ? entry.description.trim().slice(0, 160) : "";
    const quantity = Number(entry?.quantity);
    const unitPriceCents = Number(entry?.unit_price_cents);
    if (!description || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000
      || !Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) return null;
    return { description, quantity, unit_price_cents: unitPriceCents,
      amount_cents: Math.round(quantity * unitPriceCents) };
  }) : [];
  if (items.length === 0 || items.some((item) => !item)) fail(PATH, "Add a description, quantity, and price for each line item.");
  const validItems = items as { description: string; quantity: number; unit_price_cents: number; amount_cents: number }[];
  const amountCents = validItems.reduce((sum, item) => sum + item.amount_cents, 0);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000) fail(PATH, "Enter line items with a total between $0.01 and $1,000,000.");
  const email = String(fd.get("email") ?? "").trim();
  const title = String(fd.get("title") ?? "").trim();
  if (!amountCents) fail(PATH, "Enter an amount greater than 0.");
  if (!email || !title) fail(PATH, "Enter the customer's email and an invoice title.");
  const accepted = parsePairs(fd.getAll("pair").map(String));
  const problem = await validateAccepted(supabase, user.id, accepted);
  if (problem) fail(PATH, problem);
  const id = publicId("inv");
  const { error } = await supabase.from("invoices").insert({
    id, merchant_id: user.id, customer_email: email, title, amount_cents: amountCents, currency: "USD",
    line_items: validItems, design,
    customer_name: String(fd.get("name") ?? "").trim() || null,
    description: String(fd.get("description") ?? "").trim() || null,
    due_date: String(fd.get("due") ?? "") || null, accepted_payments: accepted,
  });
  if (error) fail(PATH, "Could not create the invoice.");
  if (plan !== "FREE" && design.saveDefault) {
    const { error: preferenceError } = await adminClient().from("profiles").update({ invoice_design: { ...design, saveDefault: true } }).eq("id", user.id);
    if (preferenceError) fail(PATH, "Invoice created, but the default design could not be saved.");
  }
  await supabase.from("audit_logs").insert({ merchant_id: user.id, actor: authUser.id, action: "invoice.created", target: id });
  const { data: created } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (created) await emitEvent(user.id, "invoice.created", invoiceData(created));
  revalidatePath(PATH);
  if (fd.get("send")) {
    try { await sendInvoiceEmail(id, user.id); }
    catch (e) { fail(PATH, `Invoice saved as a draft. ${e instanceof Error ? e.message : "Could not send the email."}`); }
    done(PATH, "Invoice created and emailed to your customer.");
  }
  done(PATH, "Invoice saved as a draft.");
}

export async function sendInvoice(fd: FormData): Promise<{ ok: boolean }> {
  const { user } = await requireEditor();
  const invoiceId = String(fd.get("id") ?? "");
  try {
    await sendInvoiceEmail(invoiceId, user.id);
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    console.error("Could not send invoice email.", { invoiceId, error });
    try {
      revalidatePath(PATH);
    } catch (revalidationError) {
      console.error("Could not refresh invoices after an email send failure.", { invoiceId, error: revalidationError });
    }
    return { ok: false };
  }
}

export async function cancelInvoice(fd: FormData) {
  const { user, supabase } = await requireEditor();
  const { data } = await supabase.from("invoices").update({ status: "CANCELLED" }).eq("id", String(fd.get("id"))).eq("merchant_id", user.id).in("status", ["DRAFT", "SENT", "AWAITING_PAYMENT"]).select("*").maybeSingle();
  if (data) await emitEvent(user.id, "invoice.cancelled", invoiceData(data));
  revalidatePath(PATH);
  done(PATH, "Invoice cancelled.");
}
