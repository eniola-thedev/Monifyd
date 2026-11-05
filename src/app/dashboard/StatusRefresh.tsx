"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function StatusRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
