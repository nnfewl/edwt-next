import { SAGE, smoothPath, linear, hourLabel, fmtMin } from "./chart-theme";
import { PRESSURE_STATUSES, pressureIndex } from "@/lib/analytics/pressure-index";

type Pt = { hour: number; min: number };
type Band = { hour: number; p25: number; p50: number; p75: number };

const BAND_LO = [0, 0.8, 1.15, 1.6];
const BAND_HI = [0.8, 1.15, 1.6, 2.2];

/** Render a finding string's **…** emphasis spans as <b> (styled by .hero-context b / .hero-drivers b). */
function Emph({ text }: { text: string }) {
  return <>{text.split("**").map((seg, i) => (i % 2 ? <b key={i}>{seg}</b> : seg))}</>;
}

export function PressureHero({
  status, ratio, context, drivers, today, typical,
}: { status: string; ratio: number; context: string; drivers: string; today: Pt[]; typical: Band[] }) {
  const W = 660, H = 235, padL = 40, padR = 16, padT = 16, padB = 26, maxY = 300;
  const x = linear([0, 23], [padL, W - padR]);
  const y = linear([0, maxY], [H - padB, padT]);
  const active = pressureIndex(ratio);
  const frac = Math.min(1, Math.max(0, (ratio - BAND_LO[active]) / (BAND_HI[active] - BAND_LO[active])));

  const bandTop = typical.map((t) => [x(t.hour), y(Math.min(t.p75, maxY))] as [number, number]);
  const bandBottom = typical.slice().reverse().map((t) => [x(t.hour), y(Math.min(t.p25, maxY))] as [number, number]);
  const bandPath = typical.length ? smoothPath(bandTop) + "L" + smoothPath(bandBottom).slice(1) + "Z" : "";
  const typicalPath = smoothPath(typical.map((t) => [x(t.hour), y(Math.min(t.p50, maxY))]));
  const todayPts = today.map((p) => [x(p.hour), y(Math.min(p.min, maxY))] as [number, number]);
  const todayPath = smoothPath(todayPts);
  const last = todayPts[todayPts.length - 1];
  const weekday = new Date().toLocaleDateString("en-CA", { weekday: "long", timeZone: "America/Vancouver" });
  // Only call the marker "now" if the curve actually reaches the current hour —
  // on stale data, label it with the hour the readings stop at.
  const curHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  const lastHour = today[today.length - 1]?.hour;
  const markerLabel = lastHour === curHour ? "now" : hourLabel(lastHour ?? 0);

  return (
    <section className="hero">
      <div>
        <div className="hero-label">ER pressure right now</div>
        <div className="hero-status">{status}</div>
        <p className="hero-context"><Emph text={context} /></p>
        <div className="gauge">
          {PRESSURE_STATUSES.map((_, i) => (
            <i key={i} className={i <= active ? `on-${i + 1}` : ""}>
              {i === active ? <span className="needle" style={{ left: `${frac * 100}%` }} /> : null}
            </i>
          ))}
        </div>
        <div className="gauge-labels">
          {PRESSURE_STATUSES.map((s, i) => <span key={s} className={i === active ? "active" : ""}>{s}</span>)}
        </div>
        <p className="hero-drivers"><Emph text={drivers} /></p>
      </div>
      <div className="hero-chart-wrap">
        <div className="chart-title">Today, hour by hour <small>· dashed line = a typical {weekday} · band = usual range</small></div>
        <svg id="hero-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Regional ER wait today versus the typical range">
          <defs>
            <linearGradient id="todayFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SAGE.hot} stopOpacity={SAGE.todayFillTop} />
              <stop offset="100%" stopColor={SAGE.hot} stopOpacity={0} />
            </linearGradient>
          </defs>
          {[60, 120, 180, 240].map((m) => (
            <g key={m}>
              <line x1={padL} y1={y(m)} x2={W - padR} y2={y(m)} stroke={SAGE.grid} />
              <text x={padL - 8} y={y(m) + 4} fontSize={11} fill={SAGE.tick} textAnchor="end" fontWeight={700}>{m / 60}h</text>
            </g>
          ))}
          {[0, 6, 12, 18, 23].map((h) => (
            <text key={h} x={x(h)} y={H - 7} fontSize={11} fill={SAGE.tick} textAnchor="middle" fontWeight={700}>{hourLabel(h)}</text>
          ))}
          {bandPath && <path d={bandPath} fill={SAGE.band} />}
          {typical.length > 0 && <path d={typicalPath} fill="none" stroke={SAGE.primary} strokeWidth={2} strokeDasharray="1 7" strokeLinecap="round" opacity={0.9} />}
          {last && <path d={`${todayPath} L ${last[0]} ${y(0)} L ${todayPts[0][0]} ${y(0)} Z`} fill="url(#todayFill)" />}
          {todayPts.length > 0 && <path d={todayPath} fill="none" stroke={SAGE.hot} strokeWidth={3.5} strokeLinecap="round" />}
          {last && (
            <>
              <circle cx={last[0]} cy={last[1]} r={5} fill={SAGE.hot} stroke={SAGE.surface} strokeWidth={2} />
              <text x={last[0] - 10} y={last[1] - 13} fontSize={12.5} fontWeight={800} fill={SAGE.hot} textAnchor="end">{`${markerLabel} · ${fmtMin(today[today.length - 1].min)}`}</text>
            </>
          )}
          {/* Hover layer: invisible hour columns feeding the shared HoverTip, drawn last so they sit on top. */}
          {Array.from({ length: 24 }, (_, h) => {
            const t = today.find((p) => p.hour === h);
            const b = typical.find((c) => c.hour === h);
            if (!t && !b) return null;
            const lines = [hourLabel(h)];
            if (t) lines.push(`today ${fmtMin(t.min)}`);
            if (b) lines.push(`typical ${fmtMin(b.p50)} · usual ${fmtMin(b.p25)}–${fmtMin(b.p75)}`);
            const step = (W - padL - padR) / 23;
            return (
              <g key={h} className="hovercol">
                <line className="tipguide" x1={x(h)} y1={padT} x2={x(h)} y2={H - padB} />
                <rect className="tipcol" x={x(h) - step / 2} y={padT} width={step} height={H - padT - padB} data-tip={lines.join("\n")} />
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
