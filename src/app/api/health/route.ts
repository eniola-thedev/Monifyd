import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { error } = await adminClient().from("supported_networks").select("id").limit(1);
    if (error) throw new Error(error.message);
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
