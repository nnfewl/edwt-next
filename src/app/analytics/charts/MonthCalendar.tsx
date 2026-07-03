import { HEAT, fmtMin } from "./chart-theme";

type Day = { date: string; median: number | null };

// Calendar-specific ramp thresholds (mockup renderCalendar `heat`).
function calColor(v: number): string {
  return HEAT[v >= 210 ? 5 : v >= 185 ? 4 : v >= 160 ? 3 : v >= 135 ? 2 : v >= 110 ? 1 : 0];
}

export function MonthCalendar({ days }: { days: Day[] }) {
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
  return (
    <div className="card">
      <div className="cal-wrap">
        {days.map((d) => {
          const dayNum = Number(d.date.slice(-2));
          const label = new Date(d.date + "T00:00:00Z").toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" });
          return (
            <div key={d.date} className={`cal-day${d.date === todayIso ? " is-today" : ""}`}
              style={{ background: d.median != null ? calColor(d.median) : "var(--track)" }}
              title={`${label} — median ${d.median != null ? fmtMin(d.median) : "no data"}`}>{dayNum}</div>
          );
        })}
      </div>
      <div className="legend"><span><span className="legend-ramp">{HEAT.map((c) => <i key={c} style={{ background: c }} />)}</span>calmer → rougher</span></div>
    </div>
  );
}
