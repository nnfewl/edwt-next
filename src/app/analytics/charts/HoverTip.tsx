"use client";
import { useEffect, useRef } from "react";

/** One shared tooltip layer for every chart: any element carrying a `data-tip`
    attribute gets an instant styled tooltip — hover on desktop, tap on touch.
    Charts stay server-rendered; they only carry the attribute. Multi-line tips
    use "\n" (rendered via white-space: pre-line). */
export function HoverTip() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let current: Element | null = null;
    const hide = () => { current = null; el.style.opacity = "0"; };
    const place = (cx: number, cy: number) => {
      const w = el.offsetWidth, h = el.offsetHeight;
      const left = Math.min(Math.max(8, cx - w / 2), window.innerWidth - w - 8);
      const top = cy - h - 14 >= 8 ? cy - h - 14 : cy + 22;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    };
    const onPointer = (e: PointerEvent) => {
      const hit = (e.target as Element | null)?.closest?.("[data-tip]") ?? null;
      if (!hit) { if (current) hide(); return; }
      if (hit !== current) {
        current = hit;
        el.textContent = hit.getAttribute("data-tip") ?? "";
        el.style.opacity = "1";
      }
      place(e.clientX, e.clientY);
    };
    const hideOnScroll = () => hide();
    document.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("scroll", hideOnScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("scroll", hideOnScroll, { capture: true } as EventListenerOptions);
    };
  }, []);

  return <div ref={ref} className="chart-tip" aria-hidden="true" />;
}
