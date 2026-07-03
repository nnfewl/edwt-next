import { SAGE, linear, smoothPath, fmtMin } from "./chart-theme";

type GapPoint = { day: string; ed: number | null; upcc: number | null };

export function GapTrend({ gap }: { gap: GapPoint[] }) {
  const W = 620, H = 240, padL = 40, padR = 14, padT = 14, padB = 26, maxY = 240;
  const days = gap.length;
  const x = linear([0, Math.max(1, days - 1)], [padL, W - padR]);
  const y = linear([0, maxY], [H - padB, padT]);
  const ed = gap.map((g, i) => [x(i), y(Math.min(g.ed ?? 0, maxY))] as [number, number]);
  const upcc = gap.map((g, i) => [x(i), y(Math.min(g.upcc ?? 0, maxY))] as [number, number]);
  const li = days - 1;
  const gapNow = days ? Math.round((gap[li].ed ?? 0) - (gap[li].upcc ?? 0)) : 0;
  const tick = (i: number) => gap[i]?.day ? new Date(gap[i].day + "T00:00:00Z").toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" }) : "";

  return (
    <div className="card">
      <div className="card-mini-title">30-day trend <small>daily median wait</small></div>
      <svg id="gap-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="ED vs urgent-care daily median trend">
        {[60, 120, 180].map((m) => (
          <g key={m}>
            <line x1={padL} y1={y(m)} x2={W - padR} y2={y(m)} stroke={SAGE.grid} />
            <text x={padL - 8} y={y(m) + 4} fontSize={11} fill={SAGE.tick} textAnchor="end" fontWeight={700}>{m / 60}h</text>
          </g>
        ))}
        {[0, Math.floor(days / 3), Math.floor((2 * days) / 3), li].filter((val, i, a) => a.indexOf(val) === i && val >= 0).map((d) => (
          <text key={d} x={x(d)} y={H - 7} fontSize={11} fill={SAGE.tick} textAnchor="middle" fontWeight={700}>{tick(d)}</text>
        ))}
        {ed.length > 0 && <path d={smoothPath(ed)} fill="none" stroke={SAGE.hot} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
        {upcc.length > 0 && <path d={smoothPath(upcc)} fill="none" stroke={SAGE.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
        {days > 0 && (
          <>
            <line x1={x(li)} y1={ed[li][1]} x2={x(li)} y2={upcc[li][1]} stroke={SAGE.hot} strokeWidth={1.5} strokeDasharray="3 3" />
            <text x={x(li) - 6} y={(ed[li][1] + upcc[li][1]) / 2 + 4} fontSize={12.5} fontWeight={800} fill={SAGE.hot} textAnchor="end">gap: {fmtMin(gapNow)}</text>
          </>
        )}
        {/* Hover layer: invisible day columns feeding the shared HoverTip. */}
        {gap.map((g, i) => {
          const lines = [tick(i)];
          if (g.ed != null) lines.push(`ER ${fmtMin(g.ed)}`);
          if (g.upcc != null) lines.push(`urgent care ${fmtMin(g.upcc)}`);
          if (g.ed != null && g.upcc != null) lines.push(`gap ${fmtMin(Math.abs(g.ed - g.upcc))}`);
          const step = (W - padL - padR) / Math.max(1, days - 1);
          return (
            <g key={g.day} className="hovercol">
              <line className="tipguide" x1={x(i)} y1={padT} x2={x(i)} y2={H - padB} />
              <rect className="tipcol" x={x(i) - step / 2} y={padT} width={step} height={H - padT - padB} data-tip={lines.join("\n")} />
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span><i style={{ background: SAGE.hot }} />Emergency departments</span>
        <span><i style={{ background: SAGE.primary }} />Urgent &amp; primary care</span>
      </div>
    </div>
  );
}
