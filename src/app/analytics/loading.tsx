import { HeroMapBackdrop } from "../hero-map-backdrop";
import "./styles.css";

function SkeletonBar({ width = "100%", height = "14px" }: { width?: string; height?: string }) {
  return <span className="analytics-skeleton-bar" style={{ width, height }} />;
}

function SkeletonMetricCard({ tone }: { tone: "teal" | "green" | "amber" | "coral" }) {
  return (
    <article className={`analytics-metric analytics-tone-${tone} analytics-skeleton-fade`}>
      <span className="analytics-metric-mark" aria-hidden="true" />
      <SkeletonBar width="80px" height="13px" />
      <div style={{ marginTop: 8 }}>
        <SkeletonBar width="90px" height="34px" />
      </div>
      <div style={{ marginTop: 10 }}>
        <SkeletonBar width="160px" height="20px" />
      </div>
    </article>
  );
}

function SkeletonInsightCard({ tone }: { tone: "teal" | "green" | "amber" | "coral" }) {
  return (
    <article className={`analytics-insight analytics-tone-${tone} analytics-skeleton-fade`}>
      <SkeletonBar width="120px" height="13px" />
      <div style={{ marginTop: 7 }}>
        <SkeletonBar width="180px" height="21px" />
      </div>
      <div style={{ marginTop: 6 }}>
        <SkeletonBar width="220px" height="18px" />
      </div>
    </article>
  );
}

function SkeletonTableCard({ title }: { title: string }) {
  return (
    <section className="analytics-table-card analytics-skeleton-fade">
      <div className="analytics-table-head">
        <p className="analytics-eyebrow">Table</p>
        <h2>{title}</h2>
        <SkeletonBar width="260px" height="13px" />
      </div>
      <div style={{ padding: 18, display: "grid", gap: 14 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonBar key={i} width={`${85 - i * 8}%`} height="16px" />
        ))}
      </div>
    </section>
  );
}

function SkeletonChartCard({ title }: { title: string }) {
  return (
    <section className="analytics-chart-card analytics-skeleton-fade">
      <div className="analytics-chart-head">
        <p className="analytics-eyebrow">Chart</p>
        <h2>{title}</h2>
      </div>
      <div className="analytics-skeleton-chart-placeholder">
        <svg viewBox="0 0 400 200" preserveAspectRatio="none" className="analytics-skeleton-chart-svg">
          <path
            d="M0 180 Q50 160 100 140 T200 100 T300 80 T400 60"
            fill="none"
            stroke="var(--line)"
            strokeWidth="2"
          />
          <path
            d="M0 180 Q50 160 100 140 T200 100 T300 80 T400 60 V200 H0 Z"
            fill="var(--bg-2)"
            opacity="0.5"
          />
        </svg>
      </div>
    </section>
  );
}

export default function AnalyticsLoading() {
  return (
    <div className="analytics-root">
      <main className="analytics-page">
        <section className="analytics-hero">
          <HeroMapBackdrop
            className="analytics-hero-map"
            pictureClassName="analytics-hero-map-picture"
            imageClassName="analytics-hero-map-image"
          />
          <div className="analytics-hero-copy">
            <div className="analytics-kicker"><span aria-hidden="true" /> Live wait-time analytics</div>
            <h1>Wait-time analytics</h1>
            <p>
              A system-level view of current pressure, sustained risk, coverage quality, and care-type trends across tracked facilities.
            </p>
          </div>
          <aside className="analytics-window analytics-skeleton-fade" aria-label="Data window">
            <div>
              <span>Data window</span>
              <strong><SkeletonBar width="200px" height="19px" /></strong>
            </div>
            <div>
              <span>Latest source reading</span>
              <strong><SkeletonBar width="160px" height="19px" /></strong>
            </div>
          </aside>
        </section>

        <section className="analytics-metrics" aria-label="Analytics summary">
          <SkeletonMetricCard tone="teal" />
          <SkeletonMetricCard tone="green" />
          <SkeletonMetricCard tone="amber" />
          <SkeletonMetricCard tone="coral" />
        </section>

        <section className="analytics-grid analytics-grid-readout">
          <section className="analytics-panel analytics-readout analytics-skeleton-fade">
            <div className="analytics-section-head">
              <p className="analytics-eyebrow">Executive readout</p>
              <h2>What needs attention now</h2>
              <p>Fast scan of current wait-time pressure, sustained averages, and structural data gaps.</p>
            </div>
            <div className="analytics-insight-grid">
              <SkeletonInsightCard tone="coral" />
              <SkeletonInsightCard tone="teal" />
              <SkeletonInsightCard tone="amber" />
              <SkeletonInsightCard tone="green" />
            </div>
          </section>
          <section className="analytics-panel analytics-type-card analytics-skeleton-fade">
            <div className="analytics-section-head">
              <p className="analytics-eyebrow">Care type</p>
              <h2>ED vs UPCC</h2>
            </div>
            <div className="analytics-type-bars" style={{ marginTop: 20 }}>
              {["ED", "UPCC"].map((label) => (
                <div className="analytics-type-row" key={label}>
                  <div className="analytics-type-row-head">
                    <SkeletonBar width="48px" height="20px" />
                    <SkeletonBar width="180px" height="12px" />
                  </div>
                  <div className="analytics-bar-track">
                    <span className="analytics-bar-fill analytics-bar-median analytics-skeleton-bar" style={{ width: "60%" }} />
                  </div>
                  <div className="analytics-bar-track">
                    <span className="analytics-bar-fill analytics-bar-p90 analytics-skeleton-bar" style={{ width: "40%" }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>

        <div className="analytics-charts">
          <div className="analytics-chart-grid analytics-chart-grid-featured">
            <SkeletonChartCard title="Current access pressure" />
            <SkeletonChartCard title="ED vs UPCC trend" />
          </div>
          <div className="analytics-chart-grid">
            <SkeletonChartCard title="Sustained facility pressure" />
            <SkeletonChartCard title="Current wait time vs usual median" />
          </div>
          <div className="analytics-chart-grid">
            <SkeletonChartCard title="Tail-risk map" />
            <SkeletonChartCard title="Wait-time distribution" />
          </div>
          <div className="analytics-chart-grid analytics-chart-grid-featured">
            <SkeletonChartCard title="Facility-hour pattern" />
            <SkeletonChartCard title="Coverage volume" />
          </div>
        </div>

        <section className="analytics-table-grid">
          <SkeletonTableCard title="Current wait-time pressure" />
          <SkeletonTableCard title="Above-baseline signals" />
        </section>

        <section className="analytics-table-grid">
          <SkeletonTableCard title="Sustained high wait times" />
          <SkeletonTableCard title="Volatility" />
        </section>

        <section className="analytics-method-grid analytics-skeleton-fade" aria-label="Analytics notes">
          {["Median and P90 first", "Baseline per site", "Separate structural gaps"].map((title) => (
            <article key={title}>
              <h3>{title}</h3>
              <div style={{ marginTop: 8 }}>
                <SkeletonBar width="90%" height="13px" />
              </div>
              <div style={{ marginTop: 6 }}>
                <SkeletonBar width="70%" height="13px" />
              </div>
            </article>
          ))}
        </section>

        <SkeletonTableCard title="Locations without wait-time readings" />
      </main>
    </div>
  );
}
