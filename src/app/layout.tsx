import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { CookieNotice } from "./CookieNotice";
import "./globals.css";

export const metadata = { metadataBase: new URL("https://monifyd.com"), title: "Monifyd", description: "Non-custodial crypto payment gateway", icons: { icon: "/icon-512.png", shortcut: "/icon-512.png", apple: "/icon-512.png" } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>{children}<SiteFooter /><CookieNotice /></body>
    </html>
  );
}
