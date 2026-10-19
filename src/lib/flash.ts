import { redirect } from "next/navigation";

export function fail(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}
export function done(path: string, msg: string): never {
  redirect(`${path}?message=${encodeURIComponent(msg)}`);
}
