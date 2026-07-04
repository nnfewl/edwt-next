import type { Metadata } from "next";
import "../../styles.css";
import "./demo.css";

// Dev-only design playground for the drawer's closed/no-data states.
// Method: render the NORMAL has-data drawer as the reference, then derive each
// option from it slot by slot — number slot, label line, chart region.
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

function DimmedTypical() {
  return (
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
  );
}

function Panel({
  tag,
  tone,
  title,
  kind = "ed",
  caption,
  children,
}: {
  tag: string;
  tone: "ref" | "derived";
  title: string;
  kind?: "ed" | "upcc";
  caption?: string;
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
      {caption && <p className="dds-caption">{caption}</p>}
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

function ClosedLabel() {
  return (
    <div className="wait-label">
      <b className="st-closed">Closed</b>
      <span>&nbsp;· reopens 2:00 p.m. · daily 2–8 p.m.</span>
    </div>
  );
}

function NoDataLabel() {
  return (
    <div className="wait-label">
      <b className="st-open">Open</b>
      <span>&nbsp;· no posted wait ·&nbsp;</span>
      <a className="dds-call" href="#">call to check</a>
    </div>
  );
}

export default function DrawerStatesPage() {
  return (
    <div className="er-now-root">
      <main className="page dds-page">
        <h1 className="dds-title">Drawer states, derived from the normal state</h1>
        <p className="dds-sub">
          The reference is the drawer <b>with data</b>: number over the day&rsquo;s wave, label
          line, typical-day chart. Every option below keeps those slots and swaps only what the
          state can&rsquo;t have.
        </p>

        <div className="dds-trio" style={{ marginTop: 18 }}>
          <Panel tag="NORMAL · HAS DATA (reference)" tone="ref" title="Squamish General Hospital">
            <div className="wait" data-sev="medium" style={waitBlock}>
              <MiniWave tone="oklch(0.65 0.14 70)" />
              <div className="wait-num dds-num">1h 12m</div>
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
        </div>

        {/* ════ CLOSED ════ */}
        <h3 className="dds-state-head">Closed — three derivations of the number slot</h3>
        <div className="dds-trio">
          <Panel
            tag="C1 · REOPEN TIME"
            tone="derived"
            title="Edmonds UPCC"
            kind="upcc"
            caption="The number slot answers “until when?” with the clock time. Familiar, matches the card's Maps grammar."
          >
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" />
              <div className="wait-num dds-num dds-num-closed">2:00 p.m.</div>
              <ClosedLabel />
            </div>
            <h4 className="drawer-section-label usual-label">Typical day</h4>
            <DimmedTypical />
          </Panel>

          <Panel
            tag="C2 · COUNTDOWN"
            tone="derived"
            title="Edmonds UPCC"
            kind="upcc"
            caption="The number slot keeps the normal state's exact semantics — a duration. “How long until I can be seen here?” → opens in 2h 18m."
          >
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" />
              <div className="dds-eyebrow">OPENS IN</div>
              <div className="wait-num dds-num dds-num-closed">2h 18m</div>
              <ClosedLabel />
            </div>
            <h4 className="drawer-section-label usual-label">Typical day</h4>
            <DimmedTypical />
          </Panel>

          <Panel
            tag="C3 · HOURS STRIP"
            tone="derived"
            title="Edmonds UPCC"
            kind="upcc"
            caption="The chart region becomes today's hours as a timeline — where “now” sits relative to the open window. Number slot keeps the reopen time."
          >
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" />
              <div className="wait-num dds-num dds-num-closed">2:00 p.m.</div>
              <ClosedLabel />
            </div>
            <h4 className="drawer-section-label usual-label">Today&rsquo;s hours</h4>
            <div className="dds-strip-wrap">
              <div className="dds-strip">
                <span
                  className="dds-strip-open"
                  style={{ left: `${(OPEN_HOUR / 24) * 100}%`, width: `${((20 - OPEN_HOUR) / 24) * 100}%` }}
                >
                  open 2–8 p.m.
                </span>
                <span className="dds-strip-now" style={{ left: `${((NOW_HOUR + 0.6) / 24) * 100}%` }}>
                  <i />now
                </span>
              </div>
              <HourLabels />
              <div className="usual-note">Doors open in 2h 18m.</div>
            </div>
          </Panel>
        </div>

        {/* ════ NO DATA ════ */}
        <h3 className="dds-state-head">No data — three derivations of the chart region</h3>
        <div className="dds-trio">
          <Panel
            tag="N1 · GHOST CHART"
            tone="derived"
            title="Langley Memorial Hospital"
            caption="Chart frame stays as a skeleton with the explanation inside it (Carbon pattern). Quietest option."
          >
            <div className="wait" data-sev="closed" style={waitBlock}>
              <div className="wait-num dds-num dds-num-ghost">&mdash;&mdash;</div>
              <NoDataLabel />
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

          <Panel
            tag="N2 · FLATLINE"
            tone="derived"
            title="Langley Memorial Hospital"
            caption="The wave that normally carries the day's rhythm goes to a dashed flatline — “no signal”. Chart frame stays, message under the line."
          >
            <div className="wait" data-sev="closed" style={waitBlock}>
              <div className="wait-num dds-num dds-num-ghost">&mdash;&mdash;</div>
              <NoDataLabel />
            </div>
            <h4 className="drawer-section-label usual-label">Typical day</h4>
            <div className="dds-strip-wrap">
              <div className="dds-flatline">
                <i />
                <em>no signal from this site</em>
              </div>
              <HourLabels />
              <div className="usual-note">This facility never publishes wait times.</div>
            </div>
          </Panel>

          <Panel
            tag="N3 · ACTION-FORWARD"
            tone="derived"
            title="Langley Memorial Hospital"
            caption="The chart region becomes the answer to “so what do I do?” — big call & website actions. Most useful, least chart-like."
          >
            <div className="wait" data-sev="closed" style={waitBlock}>
              <div className="wait-num dds-num dds-num-ghost">&mdash;&mdash;</div>
              <NoDataLabel />
            </div>
            <h4 className="drawer-section-label usual-label">Check the current wait</h4>
            <div className="dds-actions">
              <a className="dds-action primary" href="#">Call (604) 514-6000</a>
              <a className="dds-action" href="#">Visit hospital website</a>
              <div className="usual-note">Staff can tell you the current wait over the phone.</div>
            </div>
          </Panel>
        </div>

        <p className="dds-foot">
          Options can be mixed per slot (e.g. C2&rsquo;s countdown number with C3&rsquo;s hours strip;
          N1&rsquo;s ghost chart with N3&rsquo;s actions below it). Production currently hides the
          typical-day chart on phones — this page forces it visible for review; on the real mobile
          drawer every option reduces to its number + label slots.
        </p>
      </main>
    </div>
  );
}
