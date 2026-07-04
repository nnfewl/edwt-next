import { HeroMapBackdrop } from "../hero-map-backdrop";
import "./styles.css";

// Skeleton shown while the analytics data loads. Mirrors the real layout (kept
// map header + redesigned body shells) so the load→ready transition doesn't flash.
export default function Loading() {
  return (
    <div className="analytics-root">
      <main className="analytics-page">
        <section className="analytics-hero">
          <HeroMapBackdrop className="analytics-hero-map" pictureClassName="analytics-hero-map-picture" imageClassName="analytics-hero-map-image" />
          <div className="analytics-hero-copy">
            <div className="analytics-kicker"><span aria-hidden="true" /> Live wait-time analytics</div>
            <h1>Wait-time analytics</h1>
            <p>A system-level view of current pressure, sustained risk, coverage quality, and care-type trends across tracked facilities.</p>
          </div>
          <aside className="analytics-window" aria-label="Data window">
            <div><span>Data window</span><strong>Loading…</strong></div>
            <div><span>Latest source reading</span><strong>Loading…</strong></div>
          </aside>
        </section>

        <div className="analytics-redesign">
          <section className="hero" aria-hidden="true"><div style={{ minHeight: 210 }} /><div style={{ minHeight: 210 }} /></section>
          <div className="strip" aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <div key={i} className="stat" style={{ minHeight: 66 }} />)}</div>
          {["Right now", "The rhythm", "The week"].map((label, i) => (
            <section className="block" key={label} aria-hidden="true">
              <div className="sec-eyebrow"><span>0{i + 1}</span>{label}</div>
              <div className="card" style={{ minHeight: 200 }} />
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
