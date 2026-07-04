"use client";
import { useState } from "react";
import { severityColor, fmtMin } from "./chart-theme";
import { paginate } from "@/lib/analytics/paginate";
import { HABadge } from "./HABadge";
import { Pager } from "./Pager";

type Row = { name: string; address: string | null; type: string; wait: number | null; elos: number | null };

const total = (r: Row) => (r.wait ?? 0) + (r.elos ?? 0);

function Group({ title, rows, max }: { title: string; rows: Row[]; max: number }) {
  const [page, setPage] = useState(0);
  if (rows.length === 0) return null;
  const slice = paginate(rows, page);
  return (
    <div className="rank-group">
      <div className="card-mini-title">{title}</div>
      {slice.map((r) => {
        const w = r.wait ?? 0, e = r.elos ?? 0;
        return (
          <div className="visit-row" key={r.name}>
            <div className="visit-name"><HABadge name={r.name} address={r.address} /><span className="nm">{r.name}</span></div>
            <div className="visit-track">
              <div className="visit-wait" style={{ width: `${(w / max) * 100}%`, background: severityColor(w) }} data-tip={`${r.name}\nwaiting ${fmtMin(w)}`} />
              <div className="visit-elos" style={{ width: `${(e / max) * 100}%`, background: severityColor(w) }} data-tip={`${r.name}\ntreatment (est.) ${fmtMin(e)}`} />
            </div>
            <div className="visit-total">{fmtMin(w + e)}<small>{fmtMin(w)} wait · {e ? fmtMin(e) : "—"} care</small></div>
          </div>
        );
      })}
      <Pager total={rows.length} page={page} onPage={setPage} />
    </div>
  );
}

export function VisitCost({ rows }: { rows: Row[] }) {
  const withWait = rows.filter((r) => r.wait != null);
  const byTotal = (a: Row, b: Row) => total(b) - total(a);
  const eds = withWait.filter((r) => r.type === "ed").sort(byTotal);
  const upccs = withWait.filter((r) => r.type === "upcc").sort(byTotal);
  const max = Math.max(1, ...withWait.map(total)) * 1.02;

  return (
    <div className="card">
      <Group title="Emergency departments" rows={eds} max={max} />
      <Group title="Urgent &amp; primary care" rows={upccs} max={max} />
      <div className="legend" style={{ marginTop: 14 }}>
        <span><i style={{ background: severityColor(200) }} />time waiting</span>
        <span><i style={{ background: severityColor(200), opacity: 0.38 }} />estimated time in care (ELOS)</span>
      </div>
    </div>
  );
}
