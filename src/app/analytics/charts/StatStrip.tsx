import { fmtMin } from "./chart-theme";

type Stat = { name: string; min: number } | null;

export function StatStrip({
  shortest, longest, reporting, quietWindow,
}: { shortest: Stat; longest: Stat; reporting: { open: number; total: number }; quietWindow: string }) {
  return (
    <div className="strip">
      <div className="stat">
        <div className="v good">{shortest ? fmtMin(shortest.min) : "—"}</div>
        <div className="k">Shortest ER wait{shortest ? ` · ${shortest.name}` : ""}</div>
      </div>
      <div className="stat">
        <div className="v warn">{longest ? fmtMin(longest.min) : "—"}</div>
        <div className="k">Longest ER wait{longest ? ` · ${longest.name}` : ""}</div>
      </div>
      <div className="stat">
        <div className="v">{reporting.open} / {reporting.total}</div>
        <div className="k">Facilities reporting</div>
      </div>
      <div className="stat">
        <div className="v">{quietWindow}</div>
        <div className="k">Usually the quietest window</div>
      </div>
    </div>
  );
}
