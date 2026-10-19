import type { SupabaseClient } from "@supabase/supabase-js";

export type Accepted = { asset: string; networks: string[] }[];

/** Turns checkbox values like "USDC:base" into [{asset, networks[]}]. */
export function parsePairs(values: string[]): Accepted {
  const map = new Map<string, string[]>();
  for (const v of values) {
    const [asset, network] = v.split(":");
    if (!asset || !network) continue;
    map.set(asset, [...(map.get(asset) ?? []), network]);
  }
  return [...map].map(([asset, networks]) => ({ asset, networks }));
}

/** Every pair must be enabled, and the merchant needs a receiving wallet on every network used. */
export async function validateAccepted(db: SupabaseClient, merchantId: string, accepted: Accepted): Promise<string | null> {
  if (accepted.length === 0) return "Choose at least one coin and network.";
  const [{ data: pairs }, { data: wallets }] = await Promise.all([
    db.from("asset_networks").select("asset, network").eq("enabled", true),
    db.from("wallets").select("network").eq("merchant_id", merchantId),
  ]);
  const allowed = new Set((pairs ?? []).map((p: any) => `${p.asset}:${p.network}`));
  const have = new Set((wallets ?? []).map((w: any) => w.network));
  for (const a of accepted) {
    for (const n of a.networks) {
      if (!allowed.has(`${a.asset}:${n}`)) return `${a.asset} is not supported on ${n}.`;
      if (!have.has(n)) return `Add a receiving wallet for ${n} first.`;
    }
  }
  return null;
}
