"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type AutoRefreshProps = {
  intervalMs?: number;
};

/**
 * Refreshes server components on an interval so dynamic pages re-read Postgres
 * while the tab is open. Hidden tabs skip refreshes to avoid unnecessary load.
 */
export function AutoRefresh({ intervalMs = 60_000 }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, router]);

  return null;
}
