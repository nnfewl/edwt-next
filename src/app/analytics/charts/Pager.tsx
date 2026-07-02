"use client";
import { pageCount } from "@/lib/analytics/paginate";

export function Pager({ total, page, onPage }: { total: number; page: number; onPage: (p: number) => void }) {
  const pages = pageCount(total);
  if (pages <= 1) return null;
  return (
    <div className="pager">
      {Array.from({ length: pages }, (_, p) => (
        <button
          key={p}
          type="button"
          className={`pg${p === page ? " active" : ""}`}
          aria-label={`Page ${p + 1}`}
          aria-current={p === page ? "page" : undefined}
          onClick={() => onPage(p)}
        >
          {p + 1}
        </button>
      ))}
    </div>
  );
}
