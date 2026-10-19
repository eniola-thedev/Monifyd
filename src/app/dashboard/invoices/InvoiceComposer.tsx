"use client";
import { useMemo, useState, type CSSProperties } from "react";
import type { InvoiceDesign, InvoiceTemplate } from "@/lib/invoices/design";
import { INVOICE_TEMPLATES, invoiceTextColor, parseInvoiceDesign } from "@/lib/invoices/design";
import { money } from "@/lib/format";
import type { ReactNode } from "react";
import { saveInvoicePreset } from "./actions";

type Item = { description: string; quantity: string; unitPrice: string };
const EMPTY: Item = { description: "Professional services", quantity: "1", unitPrice: "0.00" };
const names: Record<InvoiceTemplate, string> = { classic: "Classic", modern: "Modern", corporate: "Corporate", creative: "Creative" };

export function InvoiceComposer({ action, plan, businessName, initialDesign, presets, issuedDate, paymentOptions }: {
  action: (data: FormData) => void | Promise<void>; plan: "FREE" | "PRO" | "BUSINESS"; businessName: string; initialDesign: InvoiceDesign;
  presets: { name: string; design: InvoiceDesign }[]; issuedDate: string; paymentOptions: ReactNode;
}) {
  const [design, setDesign] = useState(() => parseInvoiceDesign(initialDesign));
  const [items, setItems] = useState<Item[]>([EMPTY]);
  const [preview, setPreview] = useState({ name: "", email: "", title: "Professional services", due: "", notes: "" });
  const [previewLogo, setPreviewLogo] = useState("");
  const [logoError, setLogoError] = useState("");
  const [presetName, setPresetName] = useState("");
  const [tab, setTab] = useState<"details" | "design" | "preview">("details");
  const [locked, setLocked] = useState("");
  const premium = plan !== "FREE";
  const business = plan === "BUSINESS";
  const update = (key: keyof InvoiceDesign, value: any) => setDesign((current) => ({ ...current, [key]: value }));
  const total = useMemo(() => items.reduce((sum, item) => {
    const quantity = Number(item.quantity), price = Number(item.unitPrice);
    return Number.isFinite(quantity * price) ? sum + Math.round(quantity * Math.round(price * 100)) : sum;
  }, 0), [items]);
  const lineItems = useMemo(() => JSON.stringify(items.map((item) => ({
    description: item.description.trim(), quantity: Number(item.quantity), unit_price_cents: Math.round(Number(item.unitPrice) * 100),
  }))), [items]);
  const moneyValue = (cents: number) => money(cents, "USD");
  const setItem = (index: number, key: keyof Item, value: string) => setItems((current) => current.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const resetDesign = () => { setDesign(parseInvoiceDesign(initialDesign)); setPreviewLogo(""); setLogoError(""); setLocked(""); const input = document.getElementById("design-logo") as HTMLInputElement | null; if (input) input.value = ""; };
  const selectTemplate = (template: InvoiceTemplate) => {
    if (!premium && template !== "classic") { setLocked(`${names[template]} is available with Pro. Upgrade to use all four invoice templates and customize your branding.`); return; }
    update("template", template); setLocked("");
  };
  return <div className="invoice-composer">
    <div className="invoice-composer-tabs" role="group" aria-label="Invoice editor sections">
      {([["details", "Invoice details"], ["design", "Design"], ["preview", "Preview"]] as const).map(([value, label]) => <button type="button" key={value} className={`btn btn-sm ${tab === value ? "btn-dark" : ""}`} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}
    </div>
    <form action={action} className="invoice-composer-grid">
      <input type="hidden" name="design" value={JSON.stringify(design)} />
      <input type="hidden" name="line_items" value={lineItems} />
      <input type="hidden" name="preset_name" value={presetName} />
      <section className={`invoice-editor ${tab === "details" ? "is-active" : ""}`} aria-label="Invoice details">
        <h3>Invoice details</h3>
        <div className="field"><label htmlFor="invoice-customer-name">Customer name</label><input id="invoice-customer-name" name="name" type="text" autoComplete="off" onChange={(e) => setPreview((p) => ({ ...p, name: e.target.value }))} /></div>
        <div className="field"><label htmlFor="invoice-customer-email">Customer email</label><input id="invoice-customer-email" name="email" type="email" required autoComplete="email" placeholder="customer@example.com" onChange={(e) => setPreview((p) => ({ ...p, email: e.target.value }))} /></div>
        <div className="field"><label htmlFor="invoice-title">Invoice title</label><input id="invoice-title" name="title" type="text" required defaultValue="Professional services" onChange={(e) => setPreview((p) => ({ ...p, title: e.target.value }))} /></div>
        {items.map((item, index) => <fieldset className="invoice-item-fields" key={index}><legend>Line item {index + 1}</legend>
          <div className="field"><label htmlFor={`item-description-${index}`}>Description</label><input id={`item-description-${index}`} value={item.description} maxLength={160} onChange={(e) => setItem(index, "description", e.target.value)} /></div>
          <div className="row2"><div className="field"><label htmlFor={`item-quantity-${index}`}>Quantity</label><input id={`item-quantity-${index}`} type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => setItem(index, "quantity", e.target.value)} /></div>
            <div className="field"><label htmlFor={`item-price-${index}`}>Unit price (USD)</label><input id={`item-price-${index}`} type="number" min="0" step="0.01" inputMode="decimal" value={item.unitPrice} onChange={(e) => setItem(index, "unitPrice", e.target.value)} /></div></div>
          {items.length > 1 && <button type="button" className="btn btn-sm" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>Remove item {index + 1}</button>}
        </fieldset>)}
        <button type="button" className="btn btn-sm" onClick={() => setItems((current) => [...current, { description: "", quantity: "1", unitPrice: "0.00" }])}>Add line item</button>
        <div className="row2"><div className="field"><label htmlFor="invoice-due">Due date</label><input id="invoice-due" name="due" type="date" onChange={(e) => setPreview((p) => ({ ...p, due: e.target.value }))} /></div>
          <div className="field"><label htmlFor="invoice-description">Notes</label><input id="invoice-description" name="description" type="text" onChange={(e) => setPreview((p) => ({ ...p, notes: e.target.value }))} /></div></div>
        {paymentOptions}
        <label className="check invoice-send"><input type="checkbox" name="send" defaultChecked /><span>Email this invoice to the customer now</span></label>
        <button className="btn btn-primary" type="submit">Create invoice</button>
      </section>
      <section className={`invoice-design-panel ${tab === "design" ? "is-active" : ""}`} aria-label="Invoice design">
        <div className="invoice-design-title"><div><h3>Design</h3><p className="hint">Choose a template and preview changes as you make them.</p></div><button type="button" className="btn btn-sm" onClick={resetDesign}>Reset design</button></div>
        <fieldset><legend>Template</legend><div className="invoice-templates">{INVOICE_TEMPLATES.map((template) => <button type="button" key={template} className={`invoice-template ${design.template === template ? "selected" : ""}`} aria-pressed={design.template === template} onClick={() => selectTemplate(template)}>
          <span className={`template-swatch template-${template}`} aria-hidden="true"><i /><i /><i /></span><span>{names[template]}</span>{template !== "classic" && !premium && <span className="badge">Pro</span>}
        </button>)}</div></fieldset>
        {locked && <div className="invoice-upgrade" role="status"><p>{locked}</p><a className="btn btn-sm btn-primary" href="/dashboard/billing">View Pro plans</a></div>}
        {!premium ? <div className="invoice-locked"><p>Upgrade to Pro to add your logo, match your brand colors, and personalize invoice text.</p><a href="/dashboard/billing">View Pro plans</a></div> : <>
          <div className="row2"><div className="field"><label htmlFor="design-primary">Primary color</label><input id="design-primary" type="color" value={design.primary} onChange={(e) => update("primary", e.target.value)} /></div><div className="field"><label htmlFor="design-accent">Accent color</label><input id="design-accent" type="color" value={design.accent} onChange={(e) => update("accent", e.target.value)} /></div></div>
          <div className="row2"><div className="field"><label htmlFor="design-font">Font family</label><select id="design-font" value={design.font} onChange={(e) => update("font", e.target.value)}><option value="sans">Sans serif</option><option value="serif">Serif</option><option value="mono">Monospaced</option></select></div><div className="field"><label htmlFor="design-size">Text size</label><select id="design-size" value={design.textSize} onChange={(e) => update("textSize", e.target.value)}><option value="compact">Compact</option><option value="standard">Standard</option><option value="large">Large</option></select></div></div>
          <div className="field"><label htmlFor="design-logo">Business logo</label><input id="design-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; setLogoError(file && file.size > 524288 ? "Choose an image smaller than 512 KB." : ""); if (file && file.size <= 524288) { setPreviewLogo(URL.createObjectURL(file)); update("logoUrl", "pending-upload"); } }} /><span className="hint">PNG, JPEG, or WebP. Maximum file size: 512 KB.</span>{logoError && <span className="hint" role="status">{logoError}</span>}{(previewLogo || design.logoUrl) && <button type="button" className="btn btn-sm" onClick={() => { setPreviewLogo(""); setLogoError(""); update("logoUrl", ""); const input = document.getElementById("design-logo") as HTMLInputElement | null; if (input) input.value = ""; }}>Remove logo</button>}</div>
          <div className="row2"><div className="field"><label htmlFor="design-logo-size">Logo size</label><select id="design-logo-size" value={design.logoSize} onChange={(e) => update("logoSize", e.target.value)}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></div><div className="field"><label htmlFor="design-logo-position">Logo position</label><select id="design-logo-position" value={design.logoPosition} onChange={(e) => update("logoPosition", e.target.value)}><option value="start">Start</option><option value="center">Center</option><option value="end">End</option></select></div></div>
          {[ ["heading", "Invoice heading"], ["contact", "Business contact details"], ["website", "Website"], ["paymentInstructions", "Payment instructions"], ["terms", "Terms and conditions"], ["thankYou", "Thank-you message"], ["footer", "Footer text"] ].map(([key, label]) => <div className="field" key={key}><label htmlFor={`design-${key}`}>{label}</label><textarea id={`design-${key}`} value={design[key as keyof InvoiceDesign] as string} maxLength={key === "terms" || key === "footer" ? 1000 : 500} rows={key === "terms" || key === "footer" ? 3 : 2} onChange={(e) => update(key as keyof InvoiceDesign, e.target.value)} /></div>)}
          <div className="field"><label htmlFor="design-default"><input id="design-default" type="checkbox" checked={design.saveDefault} onChange={(e) => update("saveDefault", e.target.checked)} /> Use this design for future invoices</label></div>
          {business && <fieldset className="invoice-advanced"><legend>Business layout options</legend><p className="hint">Choose which optional sections appear and their order.</p>{([ ["contact", "Business contact details"], ["instructions", "Payment instructions"], ["terms", "Terms and conditions"], ["footer", "Footer"] ] as const).map(([key, label]) => <label className="check" key={key}><input type="checkbox" checked={design.visible[key]} onChange={(e) => update("visible", { ...design.visible, [key]: e.target.checked })} /><span>Show {label.toLowerCase()}</span></label>)}
            <div className="field"><label htmlFor="design-order">Section order</label><select id="design-order" value={design.order.join(",")} onChange={(e) => update("order", e.target.value.split(","))}><option value="items,contact,instructions,terms,footer">Items, contact, payment, terms, footer</option><option value="contact,items,instructions,terms,footer">Contact, items, payment, terms, footer</option><option value="items,terms,instructions,contact,footer">Items, terms, payment, contact, footer</option></select></div>
            <div className="field"><label htmlFor="design-preset-name">Save design preset</label><input id="design-preset-name" value={presetName} maxLength={40} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. Consulting" /><span className="hint">Save up to five designs to reuse on future invoices.</span><button className="btn btn-sm" type="submit" formAction={saveInvoicePreset}>Save preset</button></div>
            {presets.length > 0 && <div className="field"><label htmlFor="design-preset-apply">Apply saved preset</label><select id="design-preset-apply" defaultValue="" onChange={(e) => { const preset = presets.find((item) => item.name === e.target.value); if (preset) setDesign(parseInvoiceDesign(preset.design)); }}><option value="">Choose a saved design</option>{presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}</select></div>}
          </fieldset>}
        </>}
      </section>
      <section className={`invoice-preview-column ${tab === "preview" ? "is-active" : ""}`} aria-label="Live invoice preview">
        <h3>Live preview</h3><InvoicePreview businessName={businessName} design={design} logoUrl={previewLogo || (design.logoUrl === "pending-upload" ? "" : design.logoUrl)} items={items} total={total} issuedDate={issuedDate} preview={preview} />
      </section>
    </form>
  </div>;
}

function InvoicePreview({ businessName, design, logoUrl, items, total, issuedDate, preview }: { businessName: string; design: InvoiceDesign; logoUrl: string; items: Item[]; total: number; issuedDate: string; preview: any }) {
  return <article className={`invoice-paper invoice-${design.template} invoice-font-${design.font} invoice-size-${design.textSize}`} style={{ "--invoice-primary": design.primary, "--invoice-primary-ink": invoiceTextColor(design.primary), "--invoice-accent": design.accent } as CSSProperties}>
    <header className={`invoice-paper-head logo-${design.logoPosition}`}>
      {logoUrl && <img className={`invoice-logo logo-size-${design.logoSize}`} src={logoUrl} alt={`${businessName} logo`} />}
      <div><p className="invoice-business">{businessName || "Your business"}</p><h4>{design.heading || "Invoice"}</h4></div>
      <strong>Assigned on save</strong>
    </header>
    <div className="invoice-preview-rule" />
    <div className="invoice-preview-parties"><div><span>Bill to</span><strong>{preview.name || "Customer name"}</strong><p>{preview.email || "customer@example.com"}</p></div><div><span>Issued</span><strong>{issuedDate}</strong><span>Due</span><strong>{preview.due || "Not set"}</strong></div></div>
    {preview.title && <h5 className="invoice-preview-title">{preview.title}</h5>}
    {preview.notes && <p className="invoice-preview-notes">{preview.notes}</p>}
    {design.order.map((section) => <div key={section}>
      {section === "items" && <><div className="invoice-preview-lines"><div className="invoice-preview-line invoice-preview-label"><span>Description</span><span>Qty</span><span>Price</span><span>Amount</span></div>{items.map((item, index) => <div className="invoice-preview-line" key={index}><span>{item.description || "Line item"}</span><span>{item.quantity || "0"}</span><span>{moneyValue(Number(item.unitPrice))}</span><strong>{money(Math.round((Number(item.quantity) || 0) * Math.round((Number(item.unitPrice) || 0) * 100)), "USD")}</strong></div>)}</div><div className="invoice-preview-total"><span>Subtotal</span><strong>{money(total, "USD")}</strong></div><div className="invoice-preview-total"><span>Total</span><strong>{money(total, "USD")}</strong></div></>}
      {section === "contact" && design.visible.contact && (design.contact || design.website) && <div>{design.contact && <p>{design.contact}</p>}{design.website && <p>{design.website}</p>}</div>}
      {section === "instructions" && design.visible.instructions && design.paymentInstructions && <p>{design.paymentInstructions}</p>}
      {section === "terms" && design.visible.terms && design.terms && <p>{design.terms}</p>}
      {section === "footer" && design.visible.footer && design.footer && <footer>{design.footer}</footer>}
    </div>)}
    {design.thankYou && <p className="invoice-thanks">{design.thankYou}</p>}
  </article>;
}
function moneyValue(value: number) { return money(Number.isFinite(value) ? Math.round(value * 100) : 0, "USD"); }
