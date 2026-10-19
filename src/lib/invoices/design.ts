export const INVOICE_TEMPLATES = ["classic", "modern", "corporate", "creative"] as const;
export type InvoiceTemplate = typeof INVOICE_TEMPLATES[number];
export type InvoiceDesign = {
  template: InvoiceTemplate;
  primary: string;
  accent: string;
  font: "sans" | "serif" | "mono";
  textSize: "compact" | "standard" | "large";
  heading: string;
  footer: string;
  thankYou: string;
  contact: string;
  website: string;
  paymentInstructions: string;
  terms: string;
  logoUrl: string;
  logoSize: "small" | "medium" | "large";
  logoPosition: "start" | "center" | "end";
  visible: { contact: boolean; instructions: boolean; terms: boolean; footer: boolean };
  order: string[];
  saveDefault: boolean;
};

export const DEFAULT_INVOICE_DESIGN: InvoiceDesign = {
  template: "classic", primary: "#18382a", accent: "#5be37d", font: "sans", textSize: "standard",
  heading: "Invoice", footer: "", thankYou: "Thank you for your business.", contact: "", website: "",
  paymentInstructions: "Pay securely using the options below.", terms: "", logoUrl: "", logoSize: "medium", logoPosition: "start",
  visible: { contact: true, instructions: true, terms: true, footer: true },
  order: ["items", "contact", "instructions", "terms", "footer"], saveDefault: true,
};

const hex = (value: unknown, fallback: string) => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
export function parseInvoiceDesign(value: unknown, fallback: InvoiceDesign = DEFAULT_INVOICE_DESIGN): InvoiceDesign {
  const raw = value && typeof value === "object" ? value as Record<string, any> : {};
  const visible = raw.visible && typeof raw.visible === "object" ? raw.visible : {};
  const order = Array.isArray(raw.order) ? raw.order.filter((v: unknown) => ["items", "contact", "instructions", "terms", "footer"].includes(String(v))) : fallback.order;
  const uniqueOrder = [...new Set(order)];
  if (!uniqueOrder.includes("items")) uniqueOrder.unshift("items");
  return {
    ...fallback,
    template: INVOICE_TEMPLATES.includes(raw.template) ? raw.template : fallback.template,
    primary: hex(raw.primary, fallback.primary), accent: hex(raw.accent, fallback.accent),
    font: ["sans", "serif", "mono"].includes(raw.font) ? raw.font : fallback.font,
    textSize: ["compact", "standard", "large"].includes(raw.textSize) ? raw.textSize : fallback.textSize,
    logoSize: ["small", "medium", "large"].includes(raw.logoSize) ? raw.logoSize : fallback.logoSize,
    logoPosition: ["start", "center", "end"].includes(raw.logoPosition) ? raw.logoPosition : fallback.logoPosition,
    heading: text(raw.heading, fallback.heading, 60), footer: text(raw.footer, fallback.footer, 500),
    thankYou: text(raw.thankYou, fallback.thankYou, 160), contact: text(raw.contact, fallback.contact, 240),
    website: text(raw.website, fallback.website, 160), paymentInstructions: text(raw.paymentInstructions, fallback.paymentInstructions, 500),
    terms: text(raw.terms, fallback.terms, 1000), logoUrl: validLogo(raw.logoUrl, fallback.logoUrl),
    visible: { contact: visible.contact !== false, instructions: visible.instructions !== false, terms: visible.terms !== false, footer: visible.footer !== false },
    order: uniqueOrder,
    saveDefault: raw.saveDefault !== false,
  };
}
export function invoiceTextColor(hexColor: string) {
  const luminance = luminanceOf(hexColor);
  return luminance > 0.179 ? "#18382a" : hexColor;
}
export function invoiceContrastOn(hexColor: string) { return luminanceOf(hexColor) > 0.179 ? "#18382a" : "#ffffff"; }
function luminanceOf(hexColor: string) {
  const channels = hexColor.slice(1).match(/.{2}/g)?.map((part) => parseInt(part, 16) / 255) ?? [0.1, 0.2, 0.15];
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function text(value: unknown, fallback: string, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : fallback; }
function validLogo(value: unknown, fallback: string) {
  if (value === "") return "";
  if (typeof value !== "string" || value.length > 2000) return fallback;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.toString() : fallback; } catch { return fallback; }
}
