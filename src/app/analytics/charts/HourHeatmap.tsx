import { heatColor, HEAT, fmtMin } from "./chart-theme";
import { HABadge } from "./HABadge";

type Cell = { name: string; type: string; hour: number; avgWait: number | null };

export function HourHeatmap({ cells }: { cells: Cell[] }) {
  const names = Array.from(new Set(cells.map((c) => c.name)));
  const byKey = new Map(cells.map((c) => [`${c.name}|${c.hour}`, c.avgWait] as const));
  return (
    <div className="card">
      <div className="card-mini-title">Average wait by hour, per facility <small>busiest first · hover for exact values</small></div>
      <div className="scrollx">
        <div className="heat-grid">
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="heat-hour-label">{h % 6 === 0 ? (h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`) : ""}</div>
          ))}
          {names.map((name) => (
            <FacilityRow key={name} name={name} byKey={byKey} />
          ))}
        </div>
      </div>
      <div className="legend"><span><span className="legend-ramp">{HEAT.map((c) => <i key={c} style={{ background: c }} />)}</span>&lt;1h → 5h+</span></div>
    </div>
  );
}

function FacilityRow({ name, byKey }: { name: string; byKey: Map<string, number | null> }) {
  return (
    <>
      <div className="heat-name"><HABadge name={name} size={18} />{name}</div>
      {Array.from({ length: 24 }, (_, h) => {
        const v = byKey.get(`${name}|${h}`);
        return <div key={h} className="heat-cell" style={{ background: v != null ? heatColor(v) : "var(--track)" }} title={v != null ? `${name} · ${h}:00 — avg ${fmtMin(v)}` : `${name} · ${h}:00 — no data`} />;
      })}
    </>
  );
}
