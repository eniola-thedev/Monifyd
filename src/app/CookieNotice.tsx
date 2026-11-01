"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const NOTICE_COOKIE = "monifyd_cookie_notice";

function hasDismissedNotice() {
  return document.cookie.split("; ").some((cookie) => cookie.startsWith(`${NOTICE_COOKIE}=dismissed`));
}

export function CookieNotice() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(!hasDismissedNotice());
  }, []);

  if (!visible) return null;

  function dismiss() {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${NOTICE_COOKIE}=dismissed; Max-Age=15552000; Path=/; SameSite=Lax${secure}`;
    setVisible(false);
  }

  return (
    <aside className="cookie-notice" role="region" aria-label="Cookie notice">
      <p>Monifyd uses essential cookies for sign-in and to remember this notice. We do not use analytics or advertising cookies.</p>
      <div>
        <Link href="/cookie-policy">Cookie policy</Link>
        <button type="button" className="btn btn-primary" onClick={dismiss}>Dismiss</button>
      </div>
    </aside>
  );
}
