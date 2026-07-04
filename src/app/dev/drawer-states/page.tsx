import type { Metadata } from "next";
import "../../styles.css";
import "./demo.css";

// Dev-only design playground for the drawer's closed/no-data states.
// Method: render the NORMAL has-data drawer as the reference, then derive the
// other states from it slot by slot — same big-number slot, same label line,
// same typical-day chart region — swapping only what each state can't have.
export const metadata: Metadata = {
  title: "DEV · Drawer states",
  robots: { index: false, follow: false },
};

// A believable UPCC day-shape (medians, % of max).
const TYPICAL = [
  18, 14, 12, 10, 9, 9, 11, 16, 30, 44, 52, 58,
  62, 60, 55, 50, 55, 64, 74, 82, 76, 60, 40, 26,
];
const GHOST = [
  28, 34, 30, 38, 33, 29, 36, 42, 38, 34, 40, 46,
  42, 38, 44, 40, 36, 42, 48, 44, 40, 36, 32, 30,
];

const NOW_HOUR = 11; // "now" for the normal reference
const OPEN_HOUR = 14; // closed facility reopens 2:00 p.m.

function HourLabels() {
  return (
    <div className="usual-labels" aria-hidden="true">
      <span style={{ left: `${((6 + 0.5) / 24) * 100}%` }}>6 am</span>
      <span style={{ left: `${((12 + 0.5) / 24) * 100}%` }}>noon</span>
      <span style={{ left: `${((18 + 0.5) / 24) * 100}%` }}>6 pm</span>
    </div>
  );
}

/** Soft decorative wave standing in for TodayWave behind the number. */
function MiniWave({ tone }: { tone: string }) {
  return (
    <svg className="dds-wave" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M0 74 C 40 70, 70 58, 110 56 S 190 66, 230 58 S 320 34, 360 30 L 400 26 L 400 90 L 0 90 Z"
        fill={tone}
        opacity="0.16"
      />
      <path
        d="M0 74 C 40 70, 70 58, 110 56 S 190 66, 230 58 S 320 34, 360 30 L 400 26"
        fill="none"
        stroke={tone}
        strokeWidth="1.6"
        opacity="0.45"
      />
    </svg>
  );
}

function Panel({
  tag,
  tone,
  title,
  kind = "ed",
  children,
}: {
  tag: string;
  tone: "ref" | "derived";
  title: string;
  kind?: "ed" | "upcc";
  children: React.ReactNode;
}) {
  return (
    <div className={`dds-panel-wrap ${tone}`}>
      <div className="dds-panel-tag">{tag}</div>
      <section className="drawer-panel">
        <span className={`badge ${kind === "ed" ? "emergency" : "upcc"}`}>
          <span className="bdot" />
          {kind === "ed" ? "Emergency" : "UPCC"}
        </span>
        <h2 className="drawer-title" style={{ fontSize: 25 }}>{title}</h2>
        <div className="drawer-sub">
          {kind === "ed" ? "Emergency Department" : "Urgent & Primary Care"} · All ages
        </div>
        {children}
      </section>
    </div>
  );
}

const waitBlock: React.CSSProperties = {
  position: "relative",
  alignItems: "flex-start",
  textAlign: "left",
  margin: "14px 0 18px",
  paddingBottom: 18,
  borderBottom: "1px solid var(--line)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

export default function DrawerStatesPage() {
  return (
    <div className="er-now-root">
      <main className="page dds-page">
        <h1 className="dds-title">Drawer states, derived from the normal state</h1>
        <p className="dds-sub">
          Left: the drawer as it renders <b>with data</b> — big number over the day&rsquo;s wave,
          label line, typical-day chart. The other two keep every slot and swap only what the
          state can&rsquo;t have: the number becomes the <b>reopen time</b> (closed) or a
          <b> ghost dash</b> (no data); the label becomes the status grammar; the chart stays —
          dimmed real shape when closed (Google keeps &ldquo;Popular times&rdquo; for closed places),
          ghost frame with the message inside when no data (Carbon skeleton-chart pattern).
        </p>

        <div className="dds-trio">
          {/* ── NORMAL (reference) ── */}
          <Panel tag="NORMAL · HAS DATA (reference)" tone="ref" title="Squamish General Hospital">
            <div className="wait" data-sev="medium" style={waitBlock}>
              <MiniWave tone="oklch(0.65 0.14 70)" />
              <div className="wait-num" style={{ fontSize: 58 }}>1h 12m</div>
              <div className="wait-label">
                <span className="sev-dot" />
                Moderate wait · updated 4 min ago
              </div>
            </div>
            <h4 className="drawer-section-label usual-label">Typical day</h4>
            <div className="usual-wrap" data-sev="medium">
              <div className="usual-row">
                {TYPICAL.map((h, i) => (
                  <div key={i} className="usual-slot">
                    <div
                      className="usual-bar"
                      data-state={i < NOW_HOUR ? "past" : i === NOW_HOUR ? "now" : undefined}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                ))}
              </div>
              <HourLabels />
              <div className="usual-note">Typical for this hour: about 1h 5m.</div>
            </div>
          </Panel>

          {/* ── CLOSED (derived) ── */}
          <Panel tag="CLOSED (derived)" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" />
              <div className="wait-num dds-num-closed" style={{ fontSize: 58 }}>2:00 p.m.</div>
              <div className="wait-label">
                <b className="st-closed">Closed</b>
                <span>&nbsp;· reopens 2:00 p.m. · daily 2–8 p.m.</span>
              </div>
            </div>
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
              <div className="usual-note">Typical waits after the 2 p.m. reopening.</div>
            </div>
          </Panel>

          {/* ── NO DATA (derived) ── */}
          <Panel tag="NO DATA (derived)" tone="derived" title="Langley Memorial Hospital">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <div className="wait-num dds-num-ghost" style={{ fontSize: 58 }}>&mdash;&mdash;</div>
              <div className="wait-label">
                <b className="st-open">Open</b>
                <span>&nbsp;· no posted wait ·&nbsp;</span>
                <a className="dds-call" href="#">call to check</a>
              </div>
            </div>
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
                <span>It doesn&rsquo;t publish wait times — call ahead.</span>
              </div>
              <HourLabels />
              <div className="usual-note" style={{ visibility: "hidden" }}>&nbsp;</div>
            </div>
          </Panel>
        </div>

        <p className="dds-foot">
          Every panel keeps the same four slots — number, wave region, label, typical-day chart —
          so switching facility states never changes the drawer&rsquo;s silhouette.
        </p>
      </main>
    </div>
  );
}
