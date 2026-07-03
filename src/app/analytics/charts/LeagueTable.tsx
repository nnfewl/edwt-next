"use client";
import { useState } from "react";
import { SAGE, smoothPath, fmtMin } from "./chart-theme";
import { paginate } from "@/lib/analytics/paginate";
import { HABadge } from "./HABadge";
import { Pager } from "./Pager";

type Row = { name: string; type: string; median: number | null; eveningPeak: number | null; spark: number[]; trend7d: number | null };

function Spark({ values, up }: { values: number[]; up: boolean }) {
  const W = 110, H = 26;
  if (values.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} />;
  const max = Math.max(...values), min = Math.min(...values), span = Math.max(1, max - min);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - ((v - min) / span) * (H - 4) - 2] as [number, number]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <path d={smoothPath(pts)} fill="none" stroke={up ? SAGE.hot : SAGE.primary} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
    </svg>
  );
}

export function LeagueTable({ rows }: { rows: Row[] }) {
  const [page, setPage] = useState(0);
  const slice = paginate(rows, page);
  const arrow = (t: number | null) => {
    if (t == null || Math.abs(t) < 5) return <span className="trend-flat">→</span>;
    return t > 0 ? <span className="trend-up">▲</span> : <span className="trend-down">▼</span>;
  };

  return (
    <div className="card">
      <div className="scrollx">
        <table className="league-table">
          <thead><tr><th>Facility</th><th>Type</th><th>30-day median</th><th>Evening peak</th><th>Last 30 days</th><th>7-day trend</th></tr></thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.name}>
                <td><HABadge name={r.name} size={18} />{r.name}</td>
                <td><span className={`pill ${r.type === "ed" ? "pill-ed" : "pill-upcc"}`}>{r.type === "ed" ? "ED" : "UPCC"}</span></td>
                <td className="num">{fmtMin(r.median ?? 0)}</td>
                <td>{r.eveningPeak != null ? fmtMin(r.eveningPeak) : "—"}</td>
                <td><Spark values={r.spark} up={(r.trend7d ?? 0) > 0} /></td>
                <td>{r.trend7d == null ? "—" : <>{arrow(r.trend7d)} {Math.abs(r.trend7d) >= 5 ? `${r.trend7d > 0 ? "+" : "−"}${fmtMin(Math.abs(r.trend7d))}` : `±${fmtMin(Math.abs(r.trend7d))}`}</>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager total={rows.length} page={page} onPage={setPage} />
    </div>
  );
}
