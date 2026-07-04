"use client";
import { useState } from "react";
import { SAGE, linear, smoothPath, smoothBand, hourTicks, hourLabel } from "./chart-theme";
import { weekdayName, fmtMin } from "@/lib/analytics/format";

type DayMedian = { dow: number; median: number | null };
type Band = { dow: number; hour: number; p25: number; p50: number; p75: number };
type Pt = { hour: number; min: number };

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekTiles({ week, typical, today, todayDow }: { week: DayMedian[]; typical: Band[]; today: Pt[]; todayDow: number }) {
  const [sel, setSel] = useState(todayDow);
  const medianOf = (dow: number) => week.find((d) => d.dow === dow)?.median ?? null;

  return (
    <div className="card">
      <div className="week-grid">
        {ORDER.map((dow) => {
          const med = medianOf(dow);
          const curve = typical.filter((t) => t.dow === dow).sort((a, b) => a.hour - b.hour);
          const isToday = dow === todayDow;
          const stroke = isToday ? SAGE.hot : SAGE.primary;
          const W = 90, H = 30, maxP = 195;
          const pts = curve.map((c) => [(c.hour / 23) * W, H - Math.min(0.95, c.p50 / maxP) * H * 0.92] as [number, number]);
          const path = pts.length ? smoothPath(pts) : "";
          return (
            <div key={dow} role="button" tabIndex={0} aria-label={`Show ${weekdayName(dow)} curve`}
              className={`day-cell${isToday ? " today" : ""}${dow === sel ? " selected" : ""}`}
              onClick={() => setSel(dow)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(dow); } }}>
              <div className="day-name">{SHORT[dow]}{isToday ? " ·" : ""}</div>
              <div className="day-val">{med != null ? fmtMin(med) : "—"}</div>
              <svg className="day-spark" viewBox={`0 0 ${W} ${H}`} width="100%" height={30} preserveAspectRatio="none">
                {path && <path d={`${path} L ${W},${H} L 0,${H} Z`} fill={stroke} opacity={0.13} />}
                {path && <path d={path} fill="none" stroke={stroke} strokeWidth={1.6} />}
              </svg>
            </div>
          );
        })}
      </div>
      <WeekDetail sel={sel} typical={typical} today={today} todayDow={todayDow} />
    </div>
  );
}

function WeekDetail({ sel, typical, today, todayDow }: { sel: number; typical: Band[]; today: Pt[]; todayDow: number }) {
  const W = 980, H = 210, padL = 40, padR = 16, padT = 12, padB = 26;
  const curve = typical.filter((t) => t.dow === sel).sort((a, b) => a.hour - b.hour);
  const isToday = sel === todayDow;
  // Data-driven ceiling (integer for hydration stability) — see PressureHero.
  const maxY = Math.ceil((Math.max(240, ...curve.map((c) => c.p75), ...(isToday ? today.map((p) => p.min) : [])) * 1.06) / 30) * 30;
  const x = linear([0, 23], [padL, W - padR]);
  const y = linear([0, maxY], [H - padB, padT]);

  const p50 = curve.map((c) => [x(c.hour), y(c.p50)] as [number, number]);
  const bandPath = curve.length ? smoothBand(curve.map((c) => ({ x: x(c.hour), y0: y(c.p25), y1: y(c.p75) }))) : "";
  const actual = isToday ? today.map((p) => [x(p.hour), y(p.min)] as [number, number]) : [];

  const proj: [number, number][] = [];
  if (isToday && actual.length && curve.length) {
    const li = today[today.length - 1].hour;
    const dev = today[today.length - 1].min - (curve.find((c) => c.hour === li)?.p50 ?? today[today.length - 1].min);
    for (const c of curve.filter((c) => c.hour > li)) proj.push([x(c.hour), y(Math.min(c.p50 + dev * Math.exp(-(c.hour - li) / 3), maxY))]);
  }

  return (
    <>
      <div className="week-detail-head">
        <span className="week-detail-title">{weekdayName(sel)}{isToday ? " — today" : ""}</span>
        <span className="week-detail-note">{isToday ? "— actual so far · ┄ projected · band = usual range" : `usual ${weekdayName(sel)} range`}</span>
      </div>
      <svg id="week-detail" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${weekdayName(sel)} wait curve`}>
        <defs>
          <clipPath id="week-plot"><rect x={padL} y={0} width={W - padL - padR} height={H - padB} /></clipPath>
        </defs>
        {hourTicks(maxY).map((m) => (
          <g key={m}>
            <line x1={padL} y1={y(m)} x2={W - padR} y2={y(m)} stroke={SAGE.grid} />
            <text x={padL - 8} y={y(m) + 4} fontSize={11} fill={SAGE.tick} textAnchor="end" fontWeight={700}>{m / 60}h</text>
          </g>
        ))}
        {[0, 6, 12, 18, 23].map((h) => <text key={h} x={x(h)} y={H - 7} fontSize={11} fill={SAGE.tick} textAnchor="middle" fontWeight={700}>{hourLabel(h)}</text>)}
        <g clipPath="url(#week-plot)">
          {bandPath && <path d={bandPath} fill={SAGE.band} />}
          {p50.length > 0 && <path d={smoothPath(p50)} fill="none" stroke={SAGE.primary} strokeWidth={isToday ? 2 : 3} strokeDasharray={isToday ? "1 7" : "none"} strokeLinecap="round" opacity={0.95} />}
          {actual.length > 0 && <path d={smoothPath(actual)} fill="none" stroke={SAGE.hot} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />}
          {proj.length > 0 && <path d={smoothPath(proj)} fill="none" stroke={SAGE.hot} strokeWidth={2.5} strokeDasharray="4 6" strokeLinecap="round" opacity={0.75} />}
        </g>
        {/* Hover layer: invisible hour columns feeding the shared HoverTip. */}
        {Array.from({ length: 24 }, (_, h) => {
          const c = curve.find((b) => b.hour === h);
          const t = isToday ? today.find((p) => p.hour === h) : undefined;
          if (!c && !t) return null;
          const lines = [hourLabel(h)];
          if (t) lines.push(`actual ${fmtMin(t.min)}`);
          if (c) lines.push(`usual ${fmtMin(c.p25)}–${fmtMin(c.p75)} · median ${fmtMin(c.p50)}`);
          const step = (W - padL - padR) / 23;
          return (
            <g key={h} className="hovercol">
              <line className="tipguide" x1={x(h)} y1={padT} x2={x(h)} y2={H - padB} />
              <rect className="tipcol" x={x(h) - step / 2} y={padT} width={step} height={H - padT - padB} data-tip={lines.join("\n")} />
            </g>
          );
        })}
      </svg>
    </>
  );
}
