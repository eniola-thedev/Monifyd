import { toBase } from "@/lib/payments/units";

export function parseRefundAmount(value: string, decimals: number): bigint | null {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
    || (value.split(".")[1]?.length ?? 0) > decimals) return null;
  try {
    const amount = toBase(value, decimals);
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
}
