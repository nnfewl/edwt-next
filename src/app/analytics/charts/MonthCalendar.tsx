import { HEAT, fmtMin } from "./chart-theme";
import { heatCuts, heatBucket } from "@/lib/analytics/derive";

type Day = { date: string; median: number | null };

export function MonthCalendar({ days }: { days: Day[] }) {
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
  // Color each day relative to this window's distribution (sextiles), matching the
  // "calmer → rougher" legend and the p25-based calm-day count in the title.
  const cuts = heatCuts(days.map((d) => d.median).filter((m): m is number => m != null));
  return (
    <div className="card">
      <div className="cal-wrap">
        {days.map((d) => {
          const dayNum = Number(d.date.slice(-2));
          const label = new Date(d.date + "T00:00:00Z").toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" });
          return (
            <div key={d.date} className={`cal-day${d.date === todayIso ? " is-today" : ""}`}
              style={{ background: d.median != null ? HEAT[heatBucket(d.median, cuts)] : "var(--track)" }}
              data-tip={`${label}\nregional median ${d.median != null ? fmtMin(d.median) : "no data"}`}>{dayNum}</div>
          );
        })}
      </div>
      <div className="legend"><span><span className="legend-ramp">{HEAT.map((c) => <i key={c} style={{ background: c }} />)}</span>calmer → rougher</span></div>
    </div>
  );
}
