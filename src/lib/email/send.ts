export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("Email is not set up yet. Add RESEND_API_KEY and EMAIL_FROM to your environment.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, ...opts }),
  });
  if (!res.ok) {
    const payload: unknown = await res.json().catch(() => null);
    const providerMessage = payload && typeof payload === "object" && "message" in payload
      && typeof payload.message === "string"
      ? payload.message.replace(/[\r\n\t]+/g, " ").slice(0, 300)
      : "";
    if (res.status === 403) {
      const detail = providerMessage ? ` ${providerMessage}` : "";
      throw new Error(`Resend refused this email (403). Check that EMAIL_FROM uses a verified domain in the Resend account for this API key. If you use resend.dev, test sends may only go to your account email.${detail}`);
    }
    if (res.status === 401) {
      throw new Error("Resend rejected the API key (401). Check RESEND_API_KEY in the deployment environment.");
    }
    throw new Error(providerMessage
      ? `The email provider rejected the message (${res.status}): ${providerMessage}`
      : `The email provider rejected the message (${res.status}).`);
  }
}
