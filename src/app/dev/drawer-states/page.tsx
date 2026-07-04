import type { Metadata } from "next";
import "../../styles.css";
import "./demo.css";

// Dev-only design playground: what the details drawer shows BELOW the status
// line when a facility is closed or doesn't post waits. Research basis:
// - Google Maps "Popular times" persists when a place is closed (historical
//   shape stays useful: "how busy will it be when it reopens?").
// - Carbon/Cloudscape/PatternFly: chart empty states keep the chart's frame
//   (skeleton bars + overlay message) so the layout never collapses.
export const metadata: Metadata = {
  title: "DEV · Drawer states",
  robots: { index: false, follow: false },
};

// A believable UPCC day-shape (medians, % of max) — calm at open, lunch bump,
// evening peak. Used by the "typical day stays" proposal.
const TYPICAL = [
  18, 14, 12, 10, 9, 9, 11, 16, 30, 44, 52, 58,
  62, 60, 55, 50, 55, 64, 74, 82, 76, 60, 40, 26,
];
// Flat-ish ghost silhouette for the no-data skeleton chart.
const GHOST = [
  28, 34, 30, 38, 33, 29, 36, 42, 38, 34, 40, 46,
  42, 38, 44, 40, 36, 42, 48, 44, 40, 36, 32, 30,
];

const OPEN_HOUR = 14; // Edmonds UPCC reopens 2:00 p.m.

function HourLabels() {
  return (
    <div className="usual-labels" aria-hidden="true">
      <span style={{ left: `${((6 + 0.5) / 24) * 100}%` }}>6 am</span>
      <span style={{ left: `${((12 + 0.5) / 24) * 100}%` }}>noon</span>
      <span style={{ left: `${((18 + 0.5) / 24) * 100}%` }}>6 pm</span>
    </div>
  );
}

function StatusClosed() {
  return (
    <>
      <div className="status-line">
        <b className="st-closed">Closed</b>
        <span className="st-dot"> · </span>
        <span>Opens 2:00 p.m.</span>
      </div>
      <div className="status-sub">2:00 p.m. - 8:00 p.m. daily</div>
    </>
  );
}

function StatusNoData() {
  return (
    <>
      <div className="status-line">
        <b className="st-open">Open</b>
        <span className="st-dot"> · </span>
        <span>no posted wait</span>
      </div>
      <div className="status-sub">Call to check current wait</div>
    </>
  );
}

function Panel({
  title,
  variant,
  status,
  children,
}: {
  title: string;
  variant: "current" | "proposed";
  status: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={`dds-panel-wrap ${variant}`}>
      <div className="dds-panel-tag">{variant === "current" ? "CURRENT" : "PROPOSED"}</div>
      <section className="drawer-panel">
        <span className="badge upcc"><span className="bdot" />UPCC</span>
        <h2 className="drawer-title" style={{ fontSize: 28 }}>{title}</h2>
        <div className="drawer-sub">Urgent &amp; Primary Care · All ages</div>
        <div className="wait is-closed" data-sev="closed" style={{ position: "relative", alignItems: "flex-start", textAlign: "left", margin: "14px 0 8px", gap: 6, display: "flex", flexDirection: "column" }}>
          {status}
        </div>
        {children}
      </section>
    </div>
  );
}

export default function DrawerStatesPage() {
  return (
    <div className="er-now-root">
      <main className="page dds-page">
        <h1 className="dds-title">Drawer: closed &amp; no-data, without the void</h1>
        <p className="dds-sub">
          When a facility has data, the drawer shows a big number, a wave, and the typical-day
          chart — then closed/no-data collapses to two lines of text. These proposals keep the
          chart region alive: <b>closed keeps the real typical-day shape</b> (Google&nbsp;Maps keeps
          &ldquo;Popular times&rdquo; for closed places), and <b>no-data keeps the chart frame as a ghost</b>
          with the explanation inside it (Carbon/Cloudscape skeleton-chart pattern).
        </p>

        <h3 className="dds-state-head">Closed facility</h3>
        <div className="dds-pair">
          <Panel title="Edmonds UPCC" variant="current" status={<StatusClosed />}>
            <div className="dds-void">(nothing — the sheet just ends)</div>
          </Panel>

          <Panel title="Edmonds UPCC" variant="proposed" status={<StatusClosed />}>
            <h4 className="drawer-section-label usual-label">Typical day</h4>
            <div className="usual-wrap dds-dimmed">
              <div className="usual-row">
                {TYPICAL.map((h, i) => (
                  <div key={i} className="usual-slot">
                    <div
                      className="usual-bar"
                      data-state={i < OPEN_HOUR || i >= 20 ? "past" : undefined}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                ))}
              </div>
              <span className="dds-open-marker" style={{ left: `${((OPEN_HOUR + 0.5) / 24) * 100}%` }}>
                <i />opens 2 p.m.
              </span>
              <HourLabels />
              <div className="usual-note">Typical waits for the hours it&rsquo;s open — plan for the 2 p.m. reopening.</div>
            </div>
          </Panel>
        </div>

        <h3 className="dds-state-head">Open, but doesn&rsquo;t post waits</h3>
        <div className="dds-pair">
          <Panel title="Langley Memorial Hospital" variant="current" status={<StatusNoData />}>
            <div className="dds-void">(nothing — the sheet just ends)</div>
          </Panel>

          <Panel title="Langley Memorial Hospital" variant="proposed" status={<StatusNoData />}>
            <h4 className="drawer-section-label usual-label">Typical day</h4>
            <div className="usual-wrap dds-ghost">
              <div className="usual-row">
                {GHOST.map((h, i) => (
                  <div key={i} className="usual-slot">
                    <div className="usual-bar" style={{ height: `${h}%` }} />
                  </div>
                ))}
              </div>
              <div className="dds-ghost-overlay">
                <strong>No wait data for this site</strong>
                <span>It doesn&rsquo;t publish wait times — call ahead to check.</span>
              </div>
              <HourLabels />
              <div className="usual-note" style={{ visibility: "hidden" }}>&nbsp;</div>
            </div>
          </Panel>
        </div>

        <p className="dds-foot">
          Both proposals reuse the drawer&rsquo;s existing <code>usual-*</code> chart primitives (and the
          skeleton style it already has for loading), so the drawer keeps one silhouette across
          all four states: loading → data → closed → no-data.
        </p>
      </main>
    </div>
  );
}
