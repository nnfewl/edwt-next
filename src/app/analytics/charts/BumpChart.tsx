import { SAGE, linear } from "./chart-theme";

type Row = { name: string; ranks: number[] };

// Muted sage-adjacent hues so parallel lines stay separable where they cross,
// without competing with the highlighted movers. Keyed to a hash of the name
// (not the row index) so a facility keeps its hue when standings reorder.
const NEUTRALS = ["#7c9188", "#8a8273", "#7e8a99", "#84937b", "#94818d", "#948a7c"];

function neutralFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return NEUTRALS[Math.abs(hash) % NEUTRALS.length];
}

// Names arrive pre-shortened (analytics-data runs chartName/shortName), so the
// right edge only needs to fit the label into the gutter.
function endLabelFor(name: string): string {
  if (name.length <= 18) return name;
  const words = name.split(" ");
  let label = words[0].length > 18 ? `${words[0].slice(0, 17)}…` : words[0];
  for (const word of words.slice(1)) {
    if (`${label} ${word}`.length > 18) break;
    label = `${label} ${word}`;
  }
  return label;
}

export function BumpChart({ rows, climber, slider }: { rows: Row[]; climber: string; slider: string | null }) {
  const W = 860, H = 320, padL = 170, padR = 150, padT = 26, padB = 20;
  const n = Math.max(...rows.map((r) => r.ranks.length), 1);
  const maxRank = Math.max(...rows.flatMap((r) => r.ranks), 1);
  const x = linear([0, Math.max(1, n - 1)], [padL, W - padR]);
  const y = linear([1, maxRank], [padT, H - padB]);
  const labels = ["4 wks ago", "3 wks ago", "2 wks ago", "this week"].slice(-n);

  return (
    <div className="scrollx">
      <svg id="bump-chart" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "860/320" }} role="img" aria-label="Weekly wait-time standings">
        {labels.map((label, w) => {
          const isCurrent = w === labels.length - 1;
          return (
            <g key={w}>
              <text
                x={x(w)}
                y={14}
                fontSize={11}
                fill={isCurrent ? SAGE.ink : SAGE.muted}
                textAnchor="middle"
                fontWeight={isCurrent ? 800 : 700}
              >
                {label}
              </text>
              <line x1={x(w)} y1={padT} x2={x(w)} y2={H - padB} stroke={SAGE.grid} />
            </g>
          );
        })}
        {rows.map((r) => {
          const isClimber = r.name === climber, isSlider = r.name === slider;
          const highlight = isClimber || isSlider;
          const color = isClimber ? SAGE.hot : isSlider ? "#d97706" : neutralFor(r.name);
          const pts = r.ranks.map((rank, w) => `${x(w)},${y(rank)}`).join(" ");
          const delta = r.ranks[0] - r.ranks[r.ranks.length - 1];
          // Rank #1 = longest wait, so climbing the table is bad news.
          const badge = delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : "";
          const badgeColor = delta > 0 ? SAGE.rose : SAGE.good;
          return (
            <g key={r.name}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth={highlight ? 3.5 : 2} strokeLinejoin="round" opacity={highlight ? 1 : 0.8} />
              {r.ranks.map((rank, w) => (
                <g key={w}>
                  <circle cx={x(w)} cy={y(rank)} r={highlight ? 5 : 3.5} fill={color} stroke={SAGE.surface} strokeWidth={1.5} />
                  {/* Oversized transparent hit target for the shared HoverTip. */}
                  <circle cx={x(w)} cy={y(rank)} r={10} fill="transparent" data-tip={`${r.name}\n${labels[w]}: #${rank} of ${maxRank} (longest = #1)`} />
                </g>
              ))}
              <text x={padL - 12} y={y(r.ranks[0]) + 4} fontSize={11.5} fontWeight={highlight ? 800 : 700} fill={highlight ? SAGE.ink : SAGE.muted} textAnchor="end">{r.name}</text>
              <text x={W - padR + 12} y={y(r.ranks[r.ranks.length - 1]) + 4} fontSize={11.5} fontWeight={highlight ? 800 : 700} fill={highlight ? SAGE.ink : SAGE.muted}>
                {endLabelFor(r.name)}
                {badge && <tspan dx={5} fill={badgeColor} fontWeight={800}>{badge}</tspan>}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
