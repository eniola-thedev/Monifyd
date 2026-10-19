import { serverClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;
const EXPORTS: Record<string, { table: "payments" | "invoices"; columns: string[] }> = {
  payments: {
    table: "payments",
    columns: ["id", "status", "amount_cents", "fee_cents", "total_cents", "currency", "asset", "network", "crypto_amount", "received_amount", "payment_link_id", "invoice_id", "created_at", "confirmed_at"],
  },
  invoices: {
    table: "invoices",
    columns: ["id", "invoice_number", "status", "customer_name", "customer_email", "title", "amount_cents", "currency", "due_date", "created_at", "updated_at", "paid_at"],
  },
};

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const config = EXPORTS[type];
  if (!config) return new Response("Not found", { status: 404 });

  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const rows: Row[] = [];
  const chunk = 1000;
  for (let from = 0; ; from += chunk) {
    const { data, error } = await supabase.from(config.table).select(config.columns.join(","))
      .eq("merchant_id", user.id).order("created_at", { ascending: false }).range(from, from + chunk - 1);
    if (error) return new Response("Could not export records.", { status: 500 });
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < chunk) break;
  }
  const content = [
    config.columns.map(csvCell).join(","),
    ...rows.map((row) => config.columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\r\n");
  return new Response(`\uFEFF${content}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="monifyd-${type}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
