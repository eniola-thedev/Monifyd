const IDS: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana" };
const cache = new Map<string, { rate: number; at: number }>();

/** USD price of one unit of the asset. Stablecoins are pegged at 1. Throws when no live price is available. */
export async function usdRate(asset: string): Promise<number> {
  if (asset === "USDC" || asset === "USDT") return 1;
  const id = IDS[asset];
  if (!id) throw new Error(`No price source for ${asset}`);
  const hit = cache.get(asset);
  if (hit && Date.now() - hit.at < 60_000) return hit.rate;
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, { cache: "no-store" });
  if (!res.ok) throw new Error("Price service unavailable");
  const rate = (await res.json())?.[id]?.usd;
  if (typeof rate !== "number" || rate <= 0) throw new Error("Price service returned no price");
  cache.set(asset, { rate, at: Date.now() });
  return rate;
}

export function toCrypto(totalCents: number, rate: number, decimals: number): string {
  return (totalCents / 100 / rate).toFixed(Math.min(decimals, 8));
}
