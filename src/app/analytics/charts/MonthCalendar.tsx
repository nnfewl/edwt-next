import { HEAT, fmtMin } from "./chart-theme";
import { heatCuts, heatBucket } from "@/lib/analytics/derive";

type Day = { date: string; median: number | null };

export function MonthCalendar({ days }: { days: Day[] }) {
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
  // Color each day relative to this window's distribution (sextiles), matching the
  // "calmer → rougher" legend and the p25-based calm-day count in the title.
  const medians = days.map((d) => d.median).filter((m): m is number => m != null);
  const cuts = heatCuts(medians);
  const calmest = medians.length ? Math.min(...medians) : null;
  const roughest = medians.length ? Math.max(...medians) : null;
  const total = days.length;
  return (
    <div className="card cal-card">
      <div className="cal-wrap">
        {days.map((d, i) => {
          // Recency from the newest day (0 = most recent). CSS reveals older tiers
          // as the card widens, so a narrow card shows ~30 days and a wide one ~60.
          const recency = total - 1 - i;
          const tier = recency < 30 ? "" : recency < 45 ? " cal-x2" : " cal-x3";
          const dayNum = Number(d.date.slice(-2));
          const label = new Date(d.date + "T00:00:00Z").toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" });
          const isMonthStart = dayNum === 1;
          return (
            <div key={d.date}
              className={`cal-day${d.date === todayIso ? " is-today" : ""}${isMonthStart ? " is-month-start" : ""}${tier}`}
              style={{ background: d.median != null ? HEAT[heatBucket(d.median, cuts)] : "var(--track)" }}
              data-tip={`${label}\nregional median ${d.median != null ? fmtMin(d.median) : "no data"}`}>
              <span className="cal-num">{isMonthStart ? label : dayNum}</span>
            </div>
          );
        })}
      </div>
      <div className="cal-legend">
        {calmest != null && <b className="cal-scale-end">{fmtMin(calmest)}</b>}
        <span className="legend-ramp">{HEAT.map((c) => <i key={c} style={{ background: c }} />)}</span>
        {roughest != null && <b className="cal-scale-end">{fmtMin(roughest)}</b>}
        <span className="cal-scale-cap">calmer → rougher</span>
      </div>
    </div>
  );
}
