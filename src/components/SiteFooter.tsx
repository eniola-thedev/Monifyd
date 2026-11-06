"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const columns = [
  { title: "Product", links: [["Payment Links", "/#features"], ["API", "/developers"], ["Pricing", "/pricing"], ["Supported Networks", "/supported-networks"]] },
  { title: "Developers", links: [["Documentation", "/docs"], ["API Reference", "/api-reference"], ["Webhooks", "/webhooks"], ["API Status", "/status"]] },
  { title: "Company", links: [["About", "/about"], ["Blog", "/blog"], ["Contact", "/contact"], ["X / Twitter", "https://x.com/monifyd"]] },
  { title: "Legal & Security", links: [["Privacy Policy", "/privacy"], ["Cookie policy", "/cookie-policy"], ["Terms of Service", "/terms"], ["Security", "/security"], ["Acceptable Use", "/acceptable-use"], ["Fees & Refunds", "/fees-refunds"]] },
] as const;

export function SiteFooter() {
  const pathname = usePathname();
  if (["/dashboard", "/login", "/signup", "/pay", "/auth"].some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-top">
          <div className="site-footer-brand">
            <Link className="site-footer-logo" href="/">Monifyd</Link>
            <p>Crypto payments that go straight to your wallet.</p>
            <Link className="btn btn-primary" href="/signup">Create your account</Link>
          </div>
          {columns.map((column) => (
            <nav className="site-footer-column" key={column.title} aria-label={column.title}>
              <h2>{column.title}</h2>
              {column.links.map(([label, href]) => href.startsWith("http")
                ? <a key={label} href={href} target="_blank" rel="noreferrer">{label}</a>
                : <Link key={label} href={href}>{label}</Link>)}
            </nav>
          ))}
        </div>
        <div className="site-footer-bottom">
          <span>© {new Date().getFullYear()} Monifyd</span>
          <span>Non-custodial by design. We never hold your funds or wallet keys.</span>
        </div>
      </div>
    </footer>
  );
}
