import { createHash, randomBytes } from "node:crypto";

export type KeyMode = "live";

/** Only the SHA-256 hash is stored. The full key is shown to the merchant once. */
export function generateApiKey(mode: KeyMode = "live") {
  const secret = randomBytes(32).toString("base64url");
  const key = `sk_${mode}_${secret}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key), mode };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function parseKeyMode(key: string): KeyMode | null {
  if (key.startsWith("sk_live_")) return "live";
  return null;
}
