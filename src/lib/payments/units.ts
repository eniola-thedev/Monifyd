/** "12.345" with 6 decimals -> 12345000n. Exact, no floating point. */
export function toBase(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0").slice(0, decimals) || "0");
}

export function fromBase(units: bigint, decimals: number): string {
  const s = units.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  return decimals === 0 ? whole : `${whole}.${s.slice(s.length - decimals)}`;
}
