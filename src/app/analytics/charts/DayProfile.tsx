import { SAGE, severityColor, fmtMin, hourLabel } from "./chart-theme";

type Pt = { hour: number; min: number };

export function DayProfile({ profile, bestWindow, bestHours }: { profile: Pt[]; bestWindow: string; bestHours: [number, number] }) {
  const max = Math.max(1, ...profile.map((p) => p.min));
  return (
    <div className="card">
      <div className="card-mini-title">The regional day curve <small>median wait by hour, all ERs</small></div>
      <div className="profile-bars">
        {profile.map((p) => {
          const isBest = p.hour >= bestHours[0] && p.hour <= bestHours[1];
          return <div key={p.hour} className="pbar" style={{ height: `${(p.min / max) * 100}%`, background: isBest ? SAGE.primary : severityColor(p.min), opacity: isBest ? 1 : 0.85 }} data-tip={`${hourLabel(p.hour)}\nmedian ${fmtMin(p.min)}${isBest ? " · quietest window" : ""}`} />;
        })}
      </div>
      <div className="profile-axis"><span>12am</span><span>6am</span><span>noon</span><span>6pm</span><span>11pm</span></div>
      <div className="best-window">✓ {bestWindow}</div>
    </div>
  );
}
