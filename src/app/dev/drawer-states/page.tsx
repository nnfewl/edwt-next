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

type WaveMode = "normal" | "grey" | "flat" | "fade" | "dotted" | "outline" | "echo" | "hatch" | "dashfill" | "settle" | "flatdot" | "squash" | "ghost";

const WAVE_D = "M0 74 C 40 70, 70 58, 110 56 S 190 66, 230 58 S 320 34, 360 30 L 400 26";
const WAVE_AREA = `${WAVE_D} L 400 90 L 0 90 Z`;
// Flatline: the day's activity sits at zero while doors are shut.
const FLAT_D = "M0 80 L 400 80";
const FLAT_AREA = `${FLAT_D} L 400 90 L 0 90 Z`;
// Settle: yesterday's activity winding down to zero — wave flattens rightward.
const SETTLE_D = "M0 58 C 40 52, 70 66, 110 60 S 180 66, 220 74 C 250 79, 280 80, 400 80";
const SETTLE_AREA = `${SETTLE_D} L 400 90 L 0 90 Z`;

function MiniWave({ tone, mode = "normal" }: { tone: string; mode?: WaveMode }) {
  const flat = mode === "flat" || mode === "flatdot";
  const line = flat ? FLAT_D : mode === "settle" ? SETTLE_D : WAVE_D;
  const area = flat ? FLAT_AREA : mode === "settle" ? SETTLE_AREA : WAVE_AREA;
  const noFill = mode === "dotted" || mode === "outline" || mode === "flatdot";
  const hatched = mode === "ghost" || mode === "hatch";
  const dashed = mode === "ghost" ? "4 6" : mode === "dotted" || mode === "flatdot" ? "0.5 6" : mode === "dashfill" ? "4 6" : undefined;
  return (
    <svg className="dds-wave" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {hatched && (
          /* Diagonal hatch — the standard "no data here" fill. */
          <pattern id="dds-hatch" width="7" height="7" patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill="none" />
            <line x1="0" y1="0" x2="0" y2="7" stroke={tone} strokeWidth="1.6" opacity="0.22" />
          </pattern>
        )}
        {mode === "fade" && (
          /* Activity trailing off toward "now" — fades to nothing at the right. */
          <linearGradient id="dds-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="78%" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          )}
        {mode === "fade" && <mask id="dds-fade-mask"><rect width="400" height="90" fill="url(#dds-fade)" /></mask>}
      </defs>
      <g
        mask={mode === "fade" ? "url(#dds-fade-mask)" : undefined}
        transform={mode === "squash" ? "translate(0, 61) scale(1, 0.32)" : undefined}
      >
        {!noFill && (
          <path
            d={area}
            fill={hatched ? "url(#dds-hatch)" : tone}
            opacity={hatched ? 1 : mode === "echo" ? 0.08 : 0.16}
          />
        )}
        <path
          d={line}
          fill="none"
          stroke={tone}
          strokeWidth={mode === "dotted" || mode === "flatdot" ? 2 : 1.6}
          strokeDasharray={dashed}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity={mode === "ghost" ? 0.5 : mode === "echo" ? 0.14 : mode === "outline" ? 0.55 : 0.45}
        />
      </g>
    </svg>
  );
}

const CHART_CLASS: Record<string, string> = {
  normal: "",
  dimmed: " dds-dimmed",
  band: " dds-dimmed dds-banded",
  plain: " dds-dimmed",
  hollow: " dds-hollow",
  stub: " dds-dimmed dds-stub",
  allhollow: " dds-allhollow",
  ghost: " dds-ghost",
};

function Chart({
  mode,
  note,
}: {
  mode: "normal" | "plain" | "dimmed" | "band" | "hollow" | "stub" | "allhollow" | "ghost";
  note?: string;
}) {
  const offHours = (i: number) => i < OPEN_HOUR || i >= 20;
  return (
    <>
      <h4 className="drawer-section-label usual-label">Typical day</h4>
      <div className={`usual-wrap${CHART_CLASS[mode]}`} data-sev={mode === "normal" ? "medium" : undefined}>
        {mode === "band" && (
          <span
            className="dds-band"
            style={{ left: `${(OPEN_HOUR / 24) * 100}%`, width: `${((20 - OPEN_HOUR) / 24) * 100}%` }}
            aria-hidden="true"
          />
        )}
        <div className="usual-row">
          {TYPICAL.map((h, i) => (
            <div key={i} className="usual-slot">
              <div
                className="usual-bar"
                data-state={
                  mode === "normal"
                    ? (i < NOW_HOUR ? "past" : i === NOW_HOUR ? "now" : undefined)
                    : mode === "dimmed" || mode === "hollow" || mode === "stub"
                      ? (offHours(i) ? "off" : undefined)
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

        <h3 className="dds-state-head">Closed — wave</h3>
        <div className="dds-trio">
          <Panel tag="W1 · GREY" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="grey" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="plain" />
          </Panel>

          <Panel tag="W2 · FLATLINE" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="flat" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="plain" />
          </Panel>

          <Panel tag="W3 · FADE-OUT" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="fade" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="plain" />
          </Panel>

          <Panel tag="W4 · DOTTED" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="dotted" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="plain" />
          </Panel>

          <Panel tag="W5 · OUTLINE" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="outline" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="plain" />
          </Panel>

          <Panel tag="W6 · ECHO" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="echo" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="plain" />
          </Panel>

          <Panel tag="W7 · HATCH" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="hatch" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="plain" />
          </Panel>

          <Panel tag="W8 · DASHED FILL" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="dashfill" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="plain" />
          </Panel>

          <Panel tag="W9 · SETTLE" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="settle" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="plain" />
          </Panel>

          <Panel tag="W10 · DOTTED FLAT" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="flatdot" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="plain" />
          </Panel>

          <Panel tag="W11 · SQUASHED" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="squash" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="plain" />
          </Panel>
        </div>

        <h3 className="dds-state-head">Closed — chart</h3>
        <div className="dds-trio">
          <Panel tag="C1 · MARKER LINE" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="grey" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="dimmed" />
          </Panel>

          <Panel tag="C2 · OPEN-WINDOW BAND" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="grey" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="band" />
          </Panel>

          <Panel tag="C3 · HOLLOW OFF-HOURS" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="grey" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="hollow" />
          </Panel>

          <Panel tag="C4 · STUB OFF-HOURS" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="grey" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="stub" />
          </Panel>

          <Panel tag="C5 · ALL HOLLOW" tone="derived" title="Edmonds UPCC" kind="upcc">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="grey" />
              <div className="wait-num dds-num dds-num-closed">Closed</div>
              <div className="wait-label">
                <span>opens 2:00 p.m.</span>
              </div>
            </div>
            <Chart mode="allhollow" />
          </Panel>
        </div>

        <h3 className="dds-state-head">No data</h3>
        <div className="dds-trio">
          <Panel tag="NO DATA" tone="derived" title="Langley Memorial Hospital">
            <div className="wait" data-sev="closed" style={waitBlock}>
              <MiniWave tone="oklch(0.55 0.02 180)" mode="ghost" />
              <div className="wait-num dds-num dds-num-closed">No data</div>
              <NoDataLabel />
            </div>
            <Chart mode="ghost" />
          </Panel>
        </div>
      </main>
    </div>
  );
}
