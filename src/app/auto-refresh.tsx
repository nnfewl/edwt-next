"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type AutoRefreshProps = {
  intervalMs?: number;
};

/**
 * Refreshes server components on an interval so dynamic pages re-read Postgres
 * while the tab is open. Hidden tabs skip refreshes to avoid unnecessary load.
 *
 * Default cadence is 2 minutes. The actual DB read is fanned through a 30 s
 * in-process cache in facilities-db.ts, so multiple open tabs collapse to one
 * query per cache window regardless of how many AutoRefresh ticks fire.
 */
export function AutoRefresh({ intervalMs = 120_000 }: AutoRefreshProps) {
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
