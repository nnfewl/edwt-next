import { SAGE, DIST } from "./chart-theme";

type Bucket = { bucket: string; order: number; readings: number };

export function WaitDistribution({ buckets, regionalMedian }: { buckets: Bucket[]; regionalMedian: number }) {
  const ordered = [...buckets].sort((a, b) => a.order - b.order);
  const total = ordered.reduce((s, b) => s + b.readings, 0) || 1;
  const segs = ordered.map((b) => ({ ...b, pct: Math.round((b.readings / total) * 100) }));
  const markerOrder = regionalMedian < 60 ? 1 : regionalMedian < 120 ? 2 : regionalMedian < 180 ? 3 : regionalMedian < 240 ? 4 : 5;

  const W = 340, H = 150, padB = 22, padT = 18;
  const maxB = Math.max(1, ...ordered.map((b) => b.readings));
  const bw = W / Math.max(1, ordered.length);

  return (
    <div className="card dist-card">
      <div className="card-mini-title">What a visit looked like <small>share of posted ER waits, past 30 days</small></div>
      <div className="dist-bar">
        {segs.map((s, i) => <div key={s.bucket} className="dist-seg" style={{ flex: s.pct, background: DIST[i % DIST.length] }} data-tip={`${s.bucket} wait\n${s.pct}% of posted waits`}>{s.pct >= 6 ? `${s.pct}%` : ""}</div>)}
      </div>
      <div className="dist-labels">{segs.map((s) => <span key={s.bucket} style={{ flex: s.pct }}>{s.bucket}</span>)}</div>
      <svg id="dist-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tonight's wait vs the usual spread">
        <text x={0} y={11} fontSize={11.5} fontWeight={800} fill={SAGE.ink2}>Right now vs the usual spread</text>
        {ordered.map((b, i) => {
          const h = (b.readings / maxB) * (H - padB - padT);
          const pct = segs.find((s) => s.bucket === b.bucket)?.pct ?? 0;
          return (
            <g key={b.bucket}>
              <rect x={i * bw + 3} y={H - padB - h} width={bw - 6} height={h} rx={4} fill={SAGE.primary} opacity={0.3} />
              <rect x={i * bw + 3} y={padT} width={bw - 6} height={H - padB - padT} fill="transparent" data-tip={`${b.bucket} wait\n${pct}% of posted waits`} />
            </g>
          );
        })}
        <line x1={(markerOrder - 0.5) * bw} y1={padT} x2={(markerOrder - 0.5) * bw} y2={H - padB} stroke={SAGE.hot} strokeWidth={2.5} strokeDasharray="4 4" />
        <text x={(markerOrder - 0.5) * bw + 6} y={padT + 10} fontSize={11} fontWeight={800} fill={SAGE.hot}>now</text>
      </svg>
    </div>
  );
}
