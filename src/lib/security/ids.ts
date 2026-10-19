import { randomBytes } from "node:crypto";

/** Secure, non-sequential public IDs such as plink_k3v9... */
export function publicId(prefix: string, bytes = 12): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}
