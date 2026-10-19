const TONE: Record<string, string> = {
  PAID: "good", ACTIVE: "good", DELIVERED: "good", CONFIRMED: "good", PRO: "good", BUSINESS: "good",
  EXPIRED: "bad", FAILED: "bad", CANCELLED: "bad", DISABLED: "bad",
  UNDERPAID: "warn", OVERPAID: "warn",
};
export function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return <span className={`badge badge-${TONE[status] ?? "pending"}`}>{label}</span>;
}
