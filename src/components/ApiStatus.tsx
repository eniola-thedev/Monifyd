"use client";

import { useEffect, useState } from "react";

type Result = "checking" | "available" | "unavailable";

export function ApiStatus() {
  const [result, setResult] = useState<Result>("checking");
  useEffect(() => {
    let active = true;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => { if (active) setResult(response.ok ? "available" : "unavailable"); })
      .catch(() => { if (active) setResult("unavailable"); });
    return () => { active = false; };
  }, []);
  const label = result === "checking" ? "Checking database connectivity…" : result === "available" ? "Database connectivity is operational." : "Database connectivity is unavailable.";
  return <p className={`api-status api-status-${result}`} role="status"><span aria-hidden="true" />{label}<small>This check covers the app's database connection only; it is not a full uptime history.</small></p>;
}
