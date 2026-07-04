type Tile = { emoji: string; title: string; value: string; sub: string };

export function RecordsBoard({ tiles, moonNote }: { tiles: Tile[]; moonNote: string }) {
  return (
    <div className="card">
      <div className="rec-grid">
        {tiles.map((t) => (
          <div className="rec" key={t.title}>
            <div className="rec-emoji">{t.emoji}</div>
            <div className="rec-title">{t.title}</div>
            <div className="rec-value">{t.value}</div>
            <div className="rec-sub">{t.sub}</div>
          </div>
        ))}
      </div>
      {moonNote && <p className="rec-myth">{moonNote}</p>}
    </div>
  );
}
