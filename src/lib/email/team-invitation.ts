import { esc } from "@/lib/format";

export function teamInvitationEmail(input: { workspace: string; inviter: string; role: string; url: string }) {
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0d100e">
<p>Hello,</p>
<p>${esc(input.inviter)} invited you to join <strong>${esc(input.workspace)}</strong> on Monifyd as a ${esc(input.role)}.</p>
<p><a href="${esc(input.url)}" style="display:inline-block;background:#5be37d;color:#052112;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Accept invitation</a></p>
<p>This invitation expires in seven days. Sign in or create a Monifyd account with this email address to accept it.</p>
</div>`;
  return { subject: `Invitation to join ${input.workspace} on Monifyd`, html };
}
