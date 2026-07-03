import { SAGE, severityColor, linear, fmtMin } from "./chart-theme";

type Pt = { name: string; median: number; stddev: number; readings: number };

export function SwingScatter({ points }: { points: Pt[] }) {
  const W = 720, H = 340, padL = 46, padR = 18, padT = 22, padB = 42;
  const meds = points.map((p) => p.median), stds = points.map((p) => p.stddev);
  // Data-driven axes so points spread across the plot instead of clamping at the edges.
  // Integer axis maxima so coordinates are byte-identical across render passes (no hydration jitter).
  const maxX = Math.ceil(Math.max(60, ...meds) * 1.08);
  const maxY = Math.ceil(Math.max(20, ...stds) * 1.14);
  const sortedMid = (a: number[]) => (a.length ? [...a].sort((m, n) => m - n)[Math.floor(a.length / 2)] : 0);
  const midX = sortedMid(meds), midY = sortedMid(stds);
  const x = linear([0, maxX], [padL, W - padR]);
  const y = linear([0, maxY], [H - padB, padT]);
  const midCy = (padT + (H - padB)) / 2;
  const ql = (tx: number, ty: number, txt: string, anchor: "start" | "end") => (
    <text x={tx} y={ty} fontSize={10} fontWeight={800} fill={SAGE.faint} textAnchor={anchor} style={{ textTransform: "uppercase" }} letterSpacing="0.06">{txt}</text>
  );
  const hourTicks = [60, 120, 180, 240, 300, 360].filter((m) => m < maxX);

  const dots = points.map((p) => ({
    ...p,
    cx: Math.round(x(Math.min(p.median, maxX))),
    cy: Math.round(y(Math.min(p.stddev, maxY))),
    r: Math.round((5 + Math.sqrt(p.readings) / 45) * 10) / 10,
  }));
  // Greedy label de-collision — live data clusters points mid-plot. Prefer the side
  // facing away from the midline (upper-half → below), flip when that collides, then
  // step downward. Deterministic (fixed iteration order), so SSR and client agree.
  type Box = { x1: number; y1: number; x2: number; y2: number };
  const placedBoxes: Box[] = [];
  const labelYByName = new Map<string, number>();
  const collides = (b: Box) => placedBoxes.some((o) => b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1);
  for (const d of [...dots].sort((a, b) => a.cy - b.cy || a.cx - b.cx)) {
    const w = d.name.length * 5.4;
    const boxAt = (ly: number): Box => ({ x1: d.cx - w / 2, y1: ly - 9, x2: d.cx + w / 2, y2: ly + 2 });
    const preferred = d.cy < midCy ? d.cy + d.r + 11 : d.cy - d.r - 5;
    const flipped = d.cy < midCy ? d.cy - d.r - 5 : d.cy + d.r + 11;
    let ly = preferred;
    if (collides(boxAt(ly)) && !collides(boxAt(flipped))) ly = flipped;
    for (let tries = 0; collides(boxAt(ly)) && tries < 6; tries++) ly += 11;
    placedBoxes.push(boxAt(ly));
    labelYByName.set(d.name, ly);
  }

  return (
    <div className="card">
      <svg id="scatter-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Median wait vs swing, per facility">
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill={SAGE.card2} rx={10} />
        <line x1={x(midX)} y1={padT} x2={x(midX)} y2={H - padB} stroke={SAGE.grid} strokeWidth={1.5} />
        <line x1={padL} y1={y(midY)} x2={W - padR} y2={y(midY)} stroke={SAGE.grid} strokeWidth={1.5} />
        {ql(padL + 10, padT + 15, "SHORT BUT JUMPY", "start")}
        {ql(W - padR - 10, padT + 15, "LONG & UNPREDICTABLE", "end")}
        {ql(padL + 10, H - padB - 8, "SHORT & STEADY", "start")}
        {ql(W - padR - 10, H - padB - 8, "LONG BUT STEADY", "end")}
        {hourTicks.map((m) => <text key={m} x={x(m)} y={H - padB + 15} fontSize={10.5} fill={SAGE.tick} textAnchor="middle" fontWeight={700}>{m / 60}h</text>)}
        <text x={(padL + W - padR) / 2} y={H - 7} fontSize={11} fill={SAGE.muted} textAnchor="middle" fontWeight={750}>median wait →</text>
        <text x={13} y={midCy} fontSize={11} fill={SAGE.muted} textAnchor="middle" fontWeight={750} transform={`rotate(-90 13 ${midCy})`}>typical swing →</text>
        {dots.map((p) => (
          <g key={p.name}>
            <circle cx={p.cx} cy={p.cy} r={p.r} fill={severityColor(p.median)} opacity={0.82} stroke={SAGE.surface} strokeWidth={1.5}>
              {/* Single string child: multiple text nodes inside an SVG <title> break hydration. */}
              <title>{`${p.name} — median ${fmtMin(p.median)}, swings ±${fmtMin(p.stddev)}`}</title>
            </circle>
            <text x={p.cx} y={labelYByName.get(p.name)} fontSize={9.5} fontWeight={700} fill={SAGE.ink2} textAnchor="middle">{p.name}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
