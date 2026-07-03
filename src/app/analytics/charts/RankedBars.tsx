"use client";
import { useState } from "react";
import { severityColor, fmtMin } from "./chart-theme";
import { paginate } from "@/lib/analytics/paginate";
import { HABadge } from "./HABadge";
import { Pager } from "./Pager";
import { HEALTH_AUTHORITIES } from "@/lib/health-authorities";

type Row = { name: string; address: string | null; type: string; wait: number | null; baseline: number | null };

function Group({ title, rows, max }: { title: string; rows: Row[]; max: number }) {
  const [page, setPage] = useState(0);
  if (rows.length === 0) return null;
  const slice = paginate(rows, page);
  return (
    <div className="rank-group">
      <div className="card-mini-title">{title}</div>
      {slice.map((r) => {
        const v = r.wait as number;
        const d = r.baseline != null ? v - r.baseline : 0;
        const cls = Math.abs(d) < 10 ? "flat" : d > 0 ? "up" : "down";
        const dTxt = Math.abs(d) < 10 ? "≈ usual" : `${d > 0 ? "+" : "−"}${fmtMin(Math.abs(d))} vs usual`;
        return (
          <div className="rank-row" key={r.name}>
            <div className="rank-name"><HABadge name={r.name} address={r.address} /><span className="nm">{r.name}</span></div>
            <div className="rank-track"><div className="rank-fill" style={{ width: `${Math.min(100, (v / max) * 100)}%`, background: severityColor(v) }} /></div>
            <div className="rank-end"><span className="rank-val">{fmtMin(v)}</span><span className={`delta ${cls}`}>{dTxt}</span></div>
          </div>
        );
      })}
      <Pager total={rows.length} page={page} onPage={setPage} />
    </div>
  );
}

export function RankedBars({ rows }: { rows: Row[] }) {
  const ranked = rows.filter((r) => r.wait != null);
  const byWait = (a: Row, b: Row) => (b.wait as number) - (a.wait as number);
  const eds = ranked.filter((r) => r.type === "ed").sort(byWait);
  const upccs = ranked.filter((r) => r.type === "upcc").sort(byWait);
  const max = Math.max(240, ...ranked.map((r) => r.wait as number)) * 1.02;

  return (
    <div className="card">
      <Group title="Emergency departments" rows={eds} max={max} />
      <Group title="Urgent &amp; primary care" rows={upccs} max={max} />
      <div className="ha-legend">
        {Object.values(HEALTH_AUTHORITIES).map((a) => (
          <span key={a.name}>
            <span className="ha" style={{ background: a.badgeBackground }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.faviconPath} alt="" width={12} height={12} />
            </span>
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}
