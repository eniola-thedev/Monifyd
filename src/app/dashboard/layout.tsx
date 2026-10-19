import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";
import { DashboardSidebar } from "@/components/DashboardSidebar";

const NAV = [
  ["/dashboard", "Overview"], ["/dashboard/links", "Payment links"], ["/dashboard/invoices", "Invoices"],
  ["/dashboard/payments", "Payments"], ["/dashboard/wallets", "Wallets"],
  ["/dashboard/reports", "Reports"], ["/dashboard/team", "Team"], ["/dashboard/billing", "Upgrade"], ["/dashboard/settings", "Settings"],
] as const;

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, authUser, supabase, workspaceRole } = await requireUser();
  const [{ data: profile }, { data: actorProfile }, { count: unreadCount }] = await Promise.all([
    supabase.from("profiles").select("business_name").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", authUser.id).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("merchant_id", user.id).is("read_at", null),
  ]);
  const workspaceNav = NAV.filter(([href]) =>
    (href !== "/dashboard/team" || workspaceRole !== "VIEWER")
    && (href !== "/dashboard/billing" || workspaceRole === "OWNER"));
  const nav = actorProfile?.role === "admin" ? [...workspaceNav, ["/dashboard/admin", "Admin"] as const] : workspaceNav;
  const notificationNav = ["/dashboard/notifications", `Notifications${unreadCount ? ` (${unreadCount})` : ""}`] as const;
  const fullNav = [...nav, notificationNav];
  return (
    <div className="app">
      <DashboardSidebar links={fullNav} businessName={profile?.business_name} email={user.email ?? ""} />
      <main className="main">
        {children}
      </main>
    </div>
  );
}
