"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { AutoRefresh } from "../auto-refresh";

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="analytics-root">
      <AutoRefresh intervalMs={300_000} />
      <main className="analytics-page">
        <section className="analytics-error-panel">
          <p className="analytics-eyebrow">Database unavailable</p>
          <h1>The analytics page could not read Postgres.</h1>
          <p>
            If a cached analytics page exists, visitors keep seeing it while regeneration retries. If this is the first
            render, check <code>DATABASE_URL</code> and refresh.
          </p>
          <div className="analytics-error-actions">
            <button className="analytics-button" type="button" onClick={reset}>Try again</button>
            <Link href="/" className="analytics-button analytics-button-secondary">Back to facilities</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
