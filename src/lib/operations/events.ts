import { createHash } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";

function safeMessage(message: string) {
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted URL]")
    .replace(/\b(?:sk|whsec)_[A-Za-z0-9_-]{8,}\b/g, "[redacted secret]")
    .slice(0, 300);
}

function safeDetails(details: Record<string, unknown> | undefined) {
  if (!details) return {};
  const json = JSON.stringify(details)
    .replace(/https?:\/\/\S+/gi, "[redacted URL]")
    .replace(/\b(?:sk|whsec)_[A-Za-z0-9_-]{8,}\b/g, "[redacted secret]");
  return JSON.parse(json) as Record<string, unknown>;
}

export function operationalFingerprint(fingerprint: string) {
  return createHash("sha256").update(fingerprint).digest("hex");
}

export async function recordOperationalEvent(input: {
  source: string;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  details?: Record<string, unknown>;
  fingerprint?: string;
}) {
  const safe = safeMessage(input.message);
  const fingerprint = input.fingerprint ? operationalFingerprint(input.fingerprint) : null;
  const { error } = await adminClient().rpc("record_operational_event", {
    p_source: input.source,
    p_severity: input.severity,
    p_message: safe,
    p_details: safeDetails(input.details),
    p_fingerprint: fingerprint,
  });
  if (error) throw new Error(`Could not record operational event: ${error.message}`);
}

export async function resolveOperationalEvent(fingerprint: string) {
  const { error } = await adminClient().from("operational_events")
    .update({ resolved_at: new Date().toISOString() })
    .eq("fingerprint", operationalFingerprint(fingerprint)).is("resolved_at", null);
  if (error) throw new Error(`Could not resolve operational event: ${error.message}`);
}
