"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendInvoice } from "./actions";

export function SendInvoiceButton({ invoiceId, label }: { invoiceId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [refreshNeeded, setRefreshNeeded] = useState(false);

  function send() {
    setMessage("");
    setRefreshNeeded(false);
    const formData = new FormData();
    formData.set("id", invoiceId);

    startTransition(async () => {
      try {
        const result = await sendInvoice(formData);
        if (result.ok) {
          setMessage("Invoice email sent.");
          router.refresh();
        } else {
          setMessage("We couldn't confirm the email was sent. Refresh and check the invoice status before trying again to avoid a duplicate.");
        }
      } catch {
        setMessage("The page may be out of date. Check the invoice status before trying again to avoid a duplicate.");
        setRefreshNeeded(true);
      }
    });
  }

  return (
    <span>
      <button className="btn btn-sm" type="button" onClick={send} disabled={pending}>
        {pending ? "Sending…" : label}
      </button>
      {message && <span role="status" aria-live="polite" style={{ display: "block", marginTop: 6, maxWidth: 240, fontSize: ".8rem" }}>
        {message}
        {refreshNeeded && <> <button className="btn btn-sm" type="button" onClick={() => window.location.reload()}>Refresh page</button></>}
      </span>}
    </span>
  );
}
