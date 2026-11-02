"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { startPayment, getStatus, cancelPayment, type Started } from "./actions";
import { fromBase, toBase } from "@/lib/payments/units";
import { money } from "@/lib/format";

type Opt = { asset: string; network: string; networkName: string };
const LABEL: Record<string, string> = {
  AWAITING_PAYMENT: "Waiting for your payment", PAYMENT_DETECTED: "Payment detected", CONFIRMING: "Payment found. Waiting for blockchain confirmations",
  PAID: "Payment confirmed", EXPIRED: "This quote expired", UNDERPAID: "We received less than the amount due. Please contact the merchant to settle the difference", FAILED: "Payment failed", CANCELLED: "Payment cancelled", OVERPAID: "Payment received in full. You sent a little more than needed, so contact the merchant about the difference",
};
export default function Checkout({ reference, options, amountCents, feeCents, currency, returnUrl }: {
  reference: string; options: Opt[]; amountCents: number; feeCents: number; currency: string; returnUrl: string | null;
}) {
  const assets = useMemo(() => [...new Set(options.map((o) => o.asset))], [options]);
  const [asset, setAsset] = useState(assets[0] ?? "");
  const nets = options.filter((o) => o.asset === asset);
  const [network, setNetwork] = useState(nets[0]?.network ?? "");
  const [pay, setPay] = useState<Started | null>(null);
  const [status, setStatus] = useState("AWAITING_PAYMENT");
  const [receivedAmount, setReceivedAmount] = useState("0");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [busy, run] = useTransition();

  useEffect(() => { setNetwork(options.filter((o) => o.asset === asset)[0]?.network ?? ""); }, [asset, options]);
  useEffect(() => {
    if (!pay || ["PAID", "EXPIRED", "FAILED", "UNDERPAID", "OVERPAID", "CANCELLED"].includes(status)) return;
    const t = setInterval(async () => {
      const r = await getStatus(pay.paymentId);
      if (r.status) setStatus(r.status);
      if (r.receivedAmount !== undefined) setReceivedAmount(r.receivedAmount);
    }, 5000);
    return () => clearInterval(t);
  }, [pay, status]);

  useEffect(() => {
    if (!pay) return;
    const update = () => setRemainingSeconds(Math.max(0, Math.ceil((new Date(pay.expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [pay]);

  const cancel = () => {
    setError("");
    run(async () => {
      try {
        const result = await cancelPayment(pay!.paymentId);
        if (result.status) setStatus(result.status);
        if (result.error) setError(result.error);
      } catch {
        setError("We couldn't cancel this payment right now. Please try again.");
      }
    });
  };

  const copy = async (text: string, key: string) => { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); };

  if (!pay) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); setError(""); run(async () => { const r = await startPayment(reference, asset, network); if ("error" in r) setError(r.error); else { setPay(r); setStatus(r.status); setReceivedAmount(r.receivedAmount); } }); }}>
        <fieldset className="field"><legend>Pay with</legend>
          <div className="checks">{assets.map((a) => <label key={a} className="check"><input type="radio" name="asset" checked={asset === a} onChange={() => setAsset(a)} /><span>{a}</span></label>)}</div></fieldset>
        <fieldset className="field"><legend>Network</legend>
          <div className="checks">{nets.map((n) => <label key={n.network} className="check"><input type="radio" name="network" checked={network === n.network} onChange={() => setNetwork(n.network)} /><span>{n.networkName}</span></label>)}</div>
          <span className="hint">Send only {asset} on {nets.find((n) => n.network === network)?.networkName ?? "this network"}. Other coins or networks will be lost.</span></fieldset>
        <div className="linerow"><span>Amount</span><span>{money(amountCents, currency)}</span></div>
        <div className="linerow" style={{ fontWeight: 600 }}><span>Amount due</span><span>{money(amountCents + feeCents, currency)}</span></div>
        {error && <p className="flash err" role="alert" style={{ marginTop: 12 }}>{error}</p>}
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 16 }} disabled={busy || !network}>{busy ? "Preparing…" : "Continue"}</button>
      </form>
    );
  }

  const done = status === "PAID";
  const terminal = ["PAID", "EXPIRED", "FAILED", "UNDERPAID", "OVERPAID", "CANCELLED"].includes(status);
  const timerLabel = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const receivedUnits = toBase(receivedAmount, pay.decimals);
  const expectedUnits = toBase(pay.cryptoAmount, pay.decimals);
  const remaining = fromBase(receivedUnits >= expectedUnits ? 0n : expectedUnits - receivedUnits, pay.decimals);
  return (
    <div>
      <p role="status" aria-live="polite" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {!terminal && <span className="pulse" aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: "#e8a21a" }} />}
        {LABEL[status] ?? status}
      </p>
      {!done && !terminal && (<>
        {receivedUnits > 0n && <p className="flash ok" role="status" style={{ marginBottom: 12 }}>
          We detected {receivedAmount} {pay.asset}. It is still being confirmed. Send the remaining {remaining} {pay.asset} to the same address before the quote expires.
        </p>}
        <p>{receivedUnits > 0n ? "Total amount due" : "Send exactly this amount"}</p>
        <div className="copy" style={{ margin: "6px 0 14px" }}><span className="mono"><strong>{receivedUnits > 0n ? remaining : pay.cryptoAmount} {pay.asset}</strong> on {options.find((o) => o.network === pay.network)?.networkName}</span><button type="button" className="btn btn-sm" onClick={() => copy(receivedUnits > 0n ? remaining : pay.cryptoAmount, "amt")}>{copied === "amt" ? "Copied" : "Copy amount"}</button></div>
        <p>to this address</p>
        <div className="copy" style={{ margin: "6px 0" }}><span className="mono">{pay.address}</span><button type="button" className="btn btn-sm" onClick={() => copy(pay.address, "addr")}>{copied === "addr" ? "Copied" : "Copy address"}</button></div>
        <div className="qr" role="img" aria-label="QR code for the payment address" dangerouslySetInnerHTML={{ __html: pay.qrSvg }} />
        <p className="hint" style={{ textAlign: "center", fontSize: ".85rem", color: "var(--muted)" }}>Send the exact amount shown. Price locked for <strong>{timerLabel}</strong> more.</p>
      </>)}
      {status === "AWAITING_PAYMENT" && <button type="button" className="btn" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={cancel}>{busy ? "Cancelling…" : "Cancel payment"}</button>}
      {status === "CANCELLED" && <p className="flash" role="status">Payment cancelled.</p>}
      {status === "EXPIRED" && <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => { setPay(null); setStatus("AWAITING_PAYMENT"); }}>Get a new quote</button>}
      {done && returnUrl && <a className="btn btn-primary" style={{ width: "100%" }} href={returnUrl}>Return to merchant</a>}
      {error && <p className="flash err" role="alert" style={{ marginTop: 12 }}>{error}</p>}
    </div>
  );
}
