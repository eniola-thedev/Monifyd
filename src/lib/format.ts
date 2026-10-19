export const money = (cents: number, currency = "USD") =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency });

export const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Parses a user-entered amount into integer cents, or null when invalid. */
export function toCents(v: FormDataEntryValue | null): number | null {
  const n = Number(String(v ?? ""));
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return Math.round(n * 100);
}

export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
