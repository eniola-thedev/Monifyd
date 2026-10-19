import { esc } from "@/lib/format";

type RefundUpdate = {
  payment_id: string;
  amount: string;
  asset: string;
  network: string;
  destination: string;
  tx_hash: string | null;
};

const STATUS_COPY = {
  SENT: {
    subject: "Your refund has been sent",
    message: "The merchant has marked your refund as sent. It may take some time to appear in your wallet.",
  },
  CONFIRMED: {
    subject: "Your refund has been confirmed",
    message: "The merchant has marked your refund as confirmed on the network.",
  },
  FAILED: {
    subject: "An update about your refund",
    message: "The merchant has reported that the refund transfer did not complete. Please contact the merchant for assistance.",
  },
} as const;

export function refundUpdateEmail(refund: RefundUpdate, merchant: string, status: keyof typeof STATUS_COPY) {
  const content = STATUS_COPY[status];
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0d100e">
<p>Hello,</p>
<p>${esc(content.message)}</p>
<p>Refund: <strong>${esc(refund.amount)} ${esc(refund.asset)}</strong> on ${esc(refund.network)}</p>
<p>Destination: <code>${esc(refund.destination)}</code></p>
${refund.tx_hash ? `<p>Transaction: <code>${esc(refund.tx_hash)}</code></p>` : ""}
<p>Payment reference: ${esc(refund.payment_id)}</p>
<p>From ${esc(merchant)}</p>
</div>`;
  return { subject: `${content.subject} — ${merchant}`, html };
}
