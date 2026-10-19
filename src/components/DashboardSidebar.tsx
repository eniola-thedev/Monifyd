"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { logout } from "@/app/(auth)/actions";

type DashboardSidebarProps = {
  links: ReadonlyArray<readonly [string, string]>;
  businessName: string | null | undefined;
  email: string;
};

export function DashboardSidebar({ links, businessName, email }: DashboardSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside className={`side ${isOpen ? "is-open" : ""} ${isCollapsed ? "is-collapsed" : ""}`}>
      <div className="side-header">
        <Link href="/dashboard" aria-label="Monifyd dashboard" className="side-brand" onClick={() => setIsOpen(false)}><Logo /></Link>
        <button
          type="button"
          className="side-toggle side-toggle-mobile"
          aria-controls="dashboard-navigation"
          aria-label="Toggle sidebar"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <button
        type="button"
        className="side-toggle side-toggle-desktop"
        aria-controls="dashboard-navigation"
        aria-label="Toggle sidebar"
        aria-expanded={!isCollapsed}
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <rect x="2.5" y="3" width="15" height="14" rx="2" />
          <path d="M7.5 3v14" />
          {isCollapsed ? <path d="m10.5 8 2 2-2 2" /> : <path d="m13 8-2 2 2 2" />}
        </svg>
      </button>

      <nav id="dashboard-navigation" aria-label="Dashboard" className={`side-nav ${isOpen ? "open" : ""}`}>
        {links.map(([href, label]) => (
          <Link key={href} href={href} aria-label={label} title={isCollapsed ? label : undefined} aria-current={pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)) ? "page" : undefined} onClick={() => setIsOpen(false)}>
            <MenuIcon href={href} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className={`foot ${isOpen ? "open" : ""}`}>
        <span>{businessName ?? email}</span>
        <form action={logout}><button type="submit" className="btn btn-sm">Log out</button></form>
      </div>
    </aside>
  );
}

function MenuIcon({ href }: { href: string }) {
  const icon = href === "/dashboard" ? "overview"
    : href.includes("links") ? "links"
    : href.includes("invoices") ? "invoices"
    : href.includes("payments") ? "payments"
    : href.includes("wallets") ? "wallets"
    : href.includes("reports") ? "reports"
    : href.includes("team") ? "team"
    : href.includes("billing") ? "upgrade"
    : href.includes("settings") ? "settings"
    : href.includes("notifications") ? "notifications"
    : href.includes("admin") ? "admin" : "overview";
  const common = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className="side-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...common}>
    {icon === "overview" && <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>}
    {icon === "links" && <><path d="m9.5 14.5 5-5" /><path d="M7.2 16.8 5.8 18.2a4 4 0 0 1-5.7-5.7l4-4a4 4 0 0 1 5.7 0" transform="translate(2 -2)" /><path d="m16.8 7.2 1.4-1.4a4 4 0 0 1 5.7 5.7l-4 4a4 4 0 0 1-5.7 0" transform="translate(-2 2)" /></>}
    {icon === "invoices" && <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 16h6" /></>}
    {icon === "payments" && <><path d="M7 7h11a3 3 0 0 1 3 3v1" /><path d="m17 8 3 3 3-3" /><path d="M17 17H6a3 3 0 0 1-3-3v-1" /><path d="m7 16-3-3-3 3" /></>}
    {icon === "wallets" && <><rect x="3" y="5" width="18" height="15" rx="2.5" /><path d="M3 9h18M16 14h2" /><path d="M6 5V3.5h12" /></>}
    {icon === "reports" && <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>}
    {icon === "team" && <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1.5a6 6 0 0 1 12 0V20zM16 5.5a3 3 0 0 1 0 5.8M18 14a4 4 0 0 1 3 4v2" /></>}
    {icon === "upgrade" && <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M5 14v5h14v-5" /></>}
    {icon === "settings" && <><path d="M4 7h6m4 0h6M4 17h3m4 0h9" /><circle cx="12" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>}
    {icon === "notifications" && <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>}
    {icon === "admin" && <><path d="M12 3 20 6v5c0 5-3.3 8-8 10-4.7-2-8-5-8-10V6z" /><path d="m9 12 2 2 4-4" /></>}
  </svg>;
}
