"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type AutoRefreshProps = {
  intervalMs?: number;
  /**
   * Epoch ms of when the server rendered this page. When the client mounts on
   * a copy older than `staleAfterMs` (a build-time prerender, or ISR gone
   * stale because background regeneration failed), refresh immediately instead
   * of waiting a full interval — for a wait-times site, a day-old snapshot
   * styled as live is actively misleading.
   */
  generatedAtMs?: number;
  staleAfterMs?: number;
};

/**
 * Refreshes server components on an interval so dynamic pages re-read Postgres
 * while the tab is open. Hidden tabs skip refreshes to avoid unnecessary load.
 *
 * Default cadence is 2 minutes. The actual DB read is fanned through a 30 s
 * in-process cache in facilities-db.ts, so multiple open tabs collapse to one
 * query per cache window regardless of how many AutoRefresh ticks fire.
 */
export function AutoRefresh({
  intervalMs = 120_000,
  generatedAtMs,
  staleAfterMs = 90_000,
}: AutoRefreshProps) {
  const router = useRouter();
  // ISR serves stale-while-revalidate, so the first refresh of a long-stale
  // page can itself return stale HTML (it only *triggers* regeneration). The
  // prop then re-arrives still-old and re-runs this effect; allow one retry,
  // then stop so clock skew or a stuck regeneration can't loop refreshes.
  const staleRefreshes = useRef(0);

  useEffect(() => {
    if (generatedAtMs == null || staleRefreshes.current >= 2) return undefined;
    if (Date.now() - generatedAtMs <= staleAfterMs) return undefined;

    staleRefreshes.current += 1;
    // Small delay so hydration settles before the RSC re-fetch.
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [generatedAtMs, staleAfterMs, router]);

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
