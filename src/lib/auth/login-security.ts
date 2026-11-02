import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export function getClientIp(requestHeaders: Pick<Headers, "get">): string | null {
  const candidates = [
    requestHeaders.get("cf-connecting-ip"),
    requestHeaders.get("x-real-ip"),
    requestHeaders.get("x-forwarded-for")?.split(",")[0],
  ];

  for (const candidate of candidates) {
    const ip = candidate?.trim();
    if (ip && isIP(ip)) return ip;
  }
  return null;
}

export function hashLoginLimitKey(kind: "ip" | "email", value: string, secret: string): string {
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
}
