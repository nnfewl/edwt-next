import type { Metadata } from "next";
import "../../styles.css";
import "./demo.css";

// Dev-only: drawer closed/no-data options. Layout is IDENTICAL to the normal
// state in every panel — only the number slot, label text, and chart ghosting
// change. No new components, minimal text.
export const metadata: Metadata = {
  title: "DEV · Drawer states",
  robots: { index: false, follow: false },
};

const TYPICAL = [
  18, 14, 12, 10, 9, 9, 11, 16, 30, 44, 52, 58,
  62, 60, 55, 50, 55, 64, 74, 82, 76, 60, 40, 26,
];

const NOW_HOUR = 11;
const OPEN_HOUR = 14;

function HourLabels() {
  return (
    <div className="usual-labels" aria-hidden="true">
      <span style={{ left: `${((6 + 0.5) / 24) * 100}%` }}>6 am</span>
      <span style={{ left: `${((12 + 0.5) / 24) * 100}%` }}>noon</span>
      <span style={{ left: `${((18 + 0.5) / 24) * 100}%` }}>6 pm</span>
    </div>
  );
}

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

function Chart({
  mode,
  note,
}: {
  mode: "normal" | "dimmed" | "ghost" | "ghost-quiet";
  note?: string;
}) {
  return (
    <>
      <h4 className="drawer-section-label usual-label">Typical day</h4>
      <div
        className={`usual-wrap${mode === "dimmed" ? " dds-dimmed" : mode.startsWith("ghost") ? " dds-ghost" : ""}`}
        data-sev={mode === "normal" ? "medium" : undefined}
      >
        <div className="usual-row">
          {TYPICAL.map((h, i) => (
            <div key={i} className="usual-slot">
              <div
                className="usual-bar"
                data-state={
                  mode === "normal"
                    ? (i < NOW_HOUR ? "past" : i === NOW_HOUR ? "now" : undefined)
                    : mode === "dimmed"
                      ? (i < OPEN_HOUR || i >= 20 ? "past" : undefined)
                      : undefined
                }
                style={{ height: `${h}%` }}
              />
            </div>
          ))}
        </div>
        {mode === "dimmed" && (
          <span className="dds-open-marker dds-open-marker-bare" style={{ left: `${((OPEN_HOUR + 0.5) / 24) * 100}%` }}>
            <i />
          </span>
        )}
        {mode === "ghost" && (
          <div className="dds-ghost-overlay">
            <strong>No wait data</strong>
          </div>
        )}
        <HourLabels />
        {note ? <div className="usual-note">{note}</div> : <div className="usual-note" style={{ visibility: "hidden" }}>&nbsp;</div>}
      </div>
    </>
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

const NoDataLabel = () => (
  <div className="wait-label">
    <b className="st-open">Open</b>
    <span>&nbsp;· no posted wait</span>
  </div>
);

export default function DrawerStatesPage() {
  return (
    <div className="er-now-root">
      <main className="page dds-page">
        <h1 className="dds-title">Drawer states</h1>

        <div className="dds-trio" style={{ marginTop: 18 }}>
          <Panel tag="NORMAL (reference)" tone="ref" title="Squamish General Hospital">
            <div className="wait" data-sev="medium" style={waitBlock}>
              <MiniWave tone="oklch(0.65 0.14 70)" />
              <div className="wait-num dds-num">1h 12m</div>
              <div className="wait-label">
                <span className="sev-dot" />
                Moderate wait · updated 4 min ago
              </div>
            </div>
            <Chart mode="normal" note="Typical for this hour: about 1h 5m." />
          </Panel>
        </div>

        <h3 className="dds-state-head">Closed</h3>
        <div className="dds-trio">
          <Panel tag="CLOSED" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="dimmed" />
          </Panel>
        </div>

        <h3 className="dds-state-head">No data</h3>
        <div className="dds-trio">
          <Panel tag="NO DATA" tone="derived" title="Langley Memorial Hospital">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <div className="wait-num dds-num dds-num-ghost">&mdash;&mdash;</div>
              <NoDataLabel />
            </div>
            <Chart mode="ghost" />
          </Panel>
        </div>
      </main>
    </div>
  );
}
