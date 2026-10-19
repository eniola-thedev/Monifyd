import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export async function requireAdmin() {
  const { user, authUser, supabase } = await requireUser();
  const { data: profile, error } = await supabase.from("profiles").select("role").eq("id", authUser.id).maybeSingle();
  if (error) throw new Error(`Could not verify admin access: ${error.message}`);
  if (profile?.role !== "admin") redirect("/dashboard");
  return { user, authUser, supabase };
}
