import { SAGE, linear } from "./chart-theme";

type Row = { name: string; ranks: number[] };

export function BumpChart({ rows, climber, slider }: { rows: Row[]; climber: string; slider: string | null }) {
  const W = 860, H = 320, padL = 170, padR = 130, padT = 26, padB = 20;
  const n = Math.max(...rows.map((r) => r.ranks.length), 1);
  const maxRank = Math.max(...rows.flatMap((r) => r.ranks), 1);
  const x = linear([0, Math.max(1, n - 1)], [padL, W - padR]);
  const y = linear([1, maxRank], [padT, H - padB]);
  const labels = ["4 wks ago", "3 wks ago", "2 wks ago", "this week"].slice(-n);

  return (
    <div className="scrollx">
      <svg id="bump-chart" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "860/320" }} role="img" aria-label="Weekly wait-time standings">
        {labels.map((label, w) => (
          <g key={w}>
            <text x={x(w)} y={14} fontSize={10.5} fill={SAGE.tick} textAnchor="middle" fontWeight={750}>{label}</text>
            <line x1={x(w)} y1={padT} x2={x(w)} y2={H - padB} stroke={SAGE.grid} />
          </g>
        ))}
        {rows.map((r) => {
          const isClimber = r.name === climber, isSlider = r.name === slider;
          const highlight = isClimber || isSlider;
          const color = isClimber ? SAGE.hot : isSlider ? "#d97706" : SAGE.faint;
          const pts = r.ranks.map((rank, w) => `${x(w)},${y(rank)}`).join(" ");
          const delta = r.ranks[0] - r.ranks[r.ranks.length - 1];
          const badge = delta > 0 ? ` ▲${delta}` : delta < 0 ? ` ▼${-delta}` : "";
          // Right label: first word, widened to two when the first is too short to
          // disambiguate ("BC Children's", "St. Paul's").
          const words = r.name.split(" ");
          const endLabel = words[0].length <= 3 && words.length > 1 ? `${words[0]} ${words[1]}` : words[0];
          return (
            <g key={r.name}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth={highlight ? 3.5 : 2} strokeLinejoin="round" opacity={highlight ? 1 : 0.55} />
              {r.ranks.map((rank, w) => <circle key={w} cx={x(w)} cy={y(rank)} r={highlight ? 5 : 3.5} fill={color} stroke={SAGE.surface} strokeWidth={1.5} />)}
              <text x={padL - 12} y={y(r.ranks[0]) + 4} fontSize={11.5} fontWeight={highlight ? 800 : 700} fill={highlight ? SAGE.ink : SAGE.muted} textAnchor="end">{r.name}</text>
              <text x={W - padR + 12} y={y(r.ranks[r.ranks.length - 1]) + 4} fontSize={11.5} fontWeight={highlight ? 800 : 700} fill={highlight ? SAGE.ink : SAGE.muted}>{endLabel}{badge}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
