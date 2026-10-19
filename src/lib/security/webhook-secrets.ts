import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

export function isEncryptedWebhookSecret(secret: string) {
  return secret.startsWith(PREFIX);
}

function encryptionKey() {
  const pepper = process.env.WEBHOOK_SIGNING_SECRET_PEPPER;
  if (!pepper || Buffer.byteLength(pepper) < 32 || pepper === "change-me") {
    throw new Error("WEBHOOK_SIGNING_SECRET_PEPPER must be set to a random value of at least 32 bytes.");
  }
  return createHash("sha256").update("monifyd:webhook-secret:v1:").update(pepper).digest();
}

/** Encrypt endpoint signing secrets before storing them in the database. */
export function encryptWebhookSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

/** Old rows remain readable by the worker during migration; new rows use authenticated encryption. */
export function decryptWebhookSecret(stored: string) {
  if (!stored.startsWith(PREFIX)) return stored;
  const [ivText, tagText, ciphertextText] = stored.slice(PREFIX.length).split(".");
  if (!ivText || !tagText || ciphertextText === undefined) throw new Error("Stored webhook secret has an invalid format.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}
