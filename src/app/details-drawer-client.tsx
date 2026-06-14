import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { TodayResponse } from "./api/facilities/[id]/today/route";
import { ClosedIllustration } from "./closed-illustration";
import {
  type Facility,
  type HistoryPoint,
  facilityWaitStatusLabel,
  severityFor,
} from "./data";

export type DrawerIconName = "directions" | "globe" | "phone" | "x";

type WavePoint = { t: number; min: number; lo?: number; hi?: number };

type WaveBackgroundProps = {
  f: Facility;
  height?: number;
  intensity?: number;
  actual?: WavePoint[];
  projected?: WavePoint[];
  className?: string;
  gidSuffix?: string;
  pinnedWindowMax?: number;
};

export type DetailsDrawerProps = {
  f: Facility;
  onClose: () => void;
  IconComponent: ComponentType<{ name: DrawerIconName; size?: number }>;
  WaveBackgroundComponent: ComponentType<WaveBackgroundProps>;
};

function mapFacilityUrl(f: Facility, route = false): string {
  const params = new URLSearchParams({ facility: f.id });
  if (route) params.set("route", "1");
  return `/map?${params.toString()}`;
}

const fmtDur = (min: number) => {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const fmtHour = (h: number) => {
  const hr = ((h + 11) % 12) + 1;
  return `${hr} ${h < 12 ? "am" : "pm"}`;
};

const useTodayData = (facilityId: string) => {
  const [loaded, setLoaded] = useState<{ id: string; body: TodayResponse | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/facilities/${facilityId}/today`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: TodayResponse | null) => {
        if (!cancelled) setLoaded({ id: facilityId, body });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ id: facilityId, body: null });
      });
    return () => {
      cancelled = true;
    };
  }, [facilityId]);

  return loaded?.id === facilityId ? loaded.body : null;
};

// The card payload's 12h hourly history already covers today-so-far. Seed the
// wave with it while /today loads, so the drawer opens straight onto the today
// axis — the API response then only refines resolution and adds the projection
// instead of swapping in a whole different chart.
const VAN_CLOCK = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const vanDayAndMinute = (d: Date) => {
  const parts = VAN_CLOCK.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    t: Number(get("hour")) * 60 + Number(get("minute")),
  };
};

const todaySoFar = (hist: HistoryPoint[] | undefined): WavePoint[] => {
  if (!hist || hist.length === 0) return [];
  const today = vanDayAndMinute(new Date()).day;
  return hist.flatMap((p) => {
    const { day, t } = vanDayAndMinute(new Date(p.observedAt));
    return day === today ? [{ t, min: p.min }] : [];
  });
};

const useWaveWipe = (hasToday: boolean) => {
  const outRef = useRef<HTMLElement>(null);
  const inRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!hasToday || !outRef.current || !inRef.current) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      outRef.current.style.display = "none";
      inRef.current.style.maskImage = "none";
      return;
    }

    let tween: { kill(): void } | null = null;
    let cancelled = false;
    import("gsap").then(({ gsap }) => {
      if (cancelled) return;
      const progress = { v: 0 };
      const edge = 10;
      tween = gsap.to(progress, {
        v: 1,
        duration: 2,
        ease: "sine.inOut",
        onUpdate() {
          if (!outRef.current || !inRef.current) return;
          const p = progress.v * 100;
          const inEnd = Math.min(100, p + edge);
          const outStart = Math.max(0, p - edge);
          inRef.current.style.maskImage =
            `linear-gradient(to right, black ${p}%, transparent ${inEnd}%)`;
          outRef.current.style.maskImage =
            `linear-gradient(to right, transparent ${outStart}%, black ${p}%)`;
        },
        onComplete() {
          if (!outRef.current || !inRef.current) return;
          inRef.current.style.maskImage = "none";
          outRef.current.style.display = "none";
        },
      });
    });
    return () => { cancelled = true; tween?.kill(); };
  }, [hasToday]);

  return { outRef, inRef };
};

const TodayWave = ({
  f,
  body,
  WaveBackgroundComponent,
}: {
  f: Facility;
  body: TodayResponse | null;
  WaveBackgroundComponent: ComponentType<WaveBackgroundProps>;
}) => {
  const hasToday = body != null && body.actual.length >= 2;
  const provisional = todaySoFar(f.history);
  const preActual = provisional.length >= 2 ? provisional : undefined;
  const showToday = hasToday || preActual != null;
  const { outRef, inRef } = useWaveWipe(hasToday);

  return (
    <>
      {hasToday ? (
        <Fragment key={f.id}>
          <div ref={outRef as React.RefObject<HTMLDivElement>} className="wave-wipe-out" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 110, pointerEvents: "none" }}>
            <WaveBackgroundComponent
              f={f}
              height={110}
              intensity={0.85}
              actual={preActual}
              gidSuffix="-pre"
            />
          </div>
          <div ref={inRef as React.RefObject<HTMLDivElement>} className="wave-wipe-in" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 110, pointerEvents: "none" }}>
            <WaveBackgroundComponent
              f={f}
              height={110}
              intensity={0.85}
              actual={body.actual}
              projected={body.projected}
            />
          </div>
        </Fragment>
      ) : (
        <WaveBackgroundComponent f={f} height={110} intensity={0.85} actual={preActual} />
      )}
      {(showToday || (f.history?.length ?? 0) >= 2) && (
        <div
          className="wave-caption"
          title={
            showToday
              ? "The wave is today's waits so far · the dotted line and shaded band show the expected range for the rest of the day"
              : "The background wave traces hourly wait times over the past 12 hours"
          }
        >
          {showToday ? "Today" : "12h trend"}
        </div>
      )}
    </>
  );
};

const TypicalDayBars = ({
  usual,
  nowHour,
  sev,
}: {
  usual: { hour: number; min: number }[];
  nowHour: number;
  sev: ReturnType<typeof severityFor>;
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const byHour = new Map(usual.map((u) => [u.hour, u.min]));
  const max = Math.max(1, ...usual.map((u) => u.min));
  const busiest = usual.reduce((a, b) => (b.min > a.min ? b : a));

  const hoveredMin = hovered != null ? byHour.get(hovered) : undefined;

  return (
    <div className="usual-wrap" data-sev={sev}>
      {hovered != null && (
        <div
          className="usual-tip"
          style={{ left: `clamp(56px, ${((hovered + 0.5) / 24) * 100}%, calc(100% - 56px))` }}
        >
          {fmtHour(hovered)} · {hoveredMin != null ? `usually ~${fmtDur(hoveredMin)}` : "no data"}
        </div>
      )}
      <div
        className="usual-row"
        role="img"
        aria-label="Typical wait by hour of day"
        onMouseLeave={() => setHovered(null)}
      >
        {Array.from({ length: 24 }, (_, h) => {
          const v = byHour.get(h);
          const state = h === nowHour ? "now" : h < nowHour ? "past" : "future";
          return (
            <div
              key={h}
              className="usual-slot"
              data-hovered={hovered === h || undefined}
              onMouseEnter={() => setHovered(h)}
              aria-label={v != null ? `${fmtHour(h)} — usually ~${fmtDur(v)}` : `${fmtHour(h)} — no data`}
            >
              <div
                className="usual-bar"
                data-state={state}
                style={{ height: v != null ? `${Math.max(8, (v / max) * 100)}%` : "2px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="usual-labels" aria-hidden="true">
        <span style={{ left: `${((6 + 0.5) / 24) * 100}%` }}>6 am</span>
        <span style={{ left: `${((12 + 0.5) / 24) * 100}%` }}>noon</span>
        <span style={{ left: `${((18 + 0.5) / 24) * 100}%` }}>6 pm</span>
      </div>
      <div className="usual-note">
        Usually busiest around {fmtHour(busiest.hour)} (~{fmtDur(busiest.min)})
      </div>
    </div>
  );
};

export function DetailsDrawer({
  f,
  onClose,
  IconComponent,
  WaveBackgroundComponent,
}: DetailsDrawerProps): ReactNode {
  const panelRef = useRef<HTMLElement>(null);
  const dragState = useRef<{ startY: number; currentY: number; dragging: boolean }>({ startY: 0, currentY: 0, dragging: false });
  const today = useTodayData(f.id);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const onTouchStart = (e: TouchEvent) => {
      if (panel.scrollTop > 0) return;
      dragState.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY, dragging: false };
    };
    const onTouchMove = (e: TouchEvent) => {
      const dy = e.touches[0].clientY - dragState.current.startY;
      if (dy < 0) return;
      if (!dragState.current.dragging && dy > 8) dragState.current.dragging = true;
      if (dragState.current.dragging) {
        e.preventDefault();
        dragState.current.currentY = e.touches[0].clientY;
        panel.style.transform = `translateY(${dy}px)`;
        panel.style.transition = "none";
      }
    };
    const onTouchEnd = () => {
      if (!dragState.current.dragging) return;
      const dy = dragState.current.currentY - dragState.current.startY;
      if (dy > 100) {
        panel.style.transition = "transform 200ms ease-out";
        panel.style.transform = "translateY(100%)";
        setTimeout(onClose, 200);
      } else {
        panel.style.transition = "transform 200ms ease-out";
        panel.style.transform = "";
      }
      dragState.current.dragging = false;
    };

    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchmove", onTouchMove, { passive: false });
    panel.addEventListener("touchend", onTouchEnd);
    return () => {
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchmove", onTouchMove);
      panel.removeEventListener("touchend", onTouchEnd);
      panel.style.transform = "";
      panel.style.transition = "";
    };
  }, [onClose]);

  const sev = severityFor(f.waitMin);
  const hasWaitData = f.waitMin != null;
  const stopBubble = (e: MouseEvent) => e.stopPropagation();
  // No overflow:hidden — on mobile the block is shorter than the 110px wave,
  // and clipping would slice the wave/forecast crest under the subtitle.
  const waitInline: CSSProperties = {
    position: "relative",
    alignItems: "flex-start",
    textAlign: "left",
    margin: "14px 0 22px",
    paddingBottom: 22,
    borderBottom: "1px solid var(--line)",
  };
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside
        ref={panelRef}
        className="drawer-panel"
        onClick={stopBubble}
        role="dialog"
        aria-modal="true"
        aria-labelledby="facility-details-title"
      >
        <div className="drawer-handle" aria-hidden="true" />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <span className={`badge ${f.type === "Emergency" ? "emergency" : "upcc"}`}>
            <span className="bdot" />
            {f.type === "Emergency" ? "Emergency" : "UPCC"}
          </span>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <IconComponent name="x" size={16} />
          </button>
        </div>
        <h2 className="drawer-title" id="facility-details-title">{f.name}</h2>
        <div className="drawer-sub">
          {f.subtitle} · {f.audience}
        </div>

        <div
          className={"wait " + (!f.open ? "is-closed" : !hasWaitData ? "is-no-data" : "")}
          data-sev={sev}
          style={waitInline}
          aria-label={!f.open ? f.name + " is closed" : !hasWaitData ? f.name + " has no posted wait data" : undefined}
        >
          {f.open ? (
            hasWaitData ? (
              <>
                <TodayWave f={f} body={today} WaveBackgroundComponent={WaveBackgroundComponent} />
                <div className="wait-num" style={{ fontSize: 80 }}>
                  {f.waitText}
                </div>
                <div className="wait-label">
                  <span className="sev-dot" />
                  {facilityWaitStatusLabel(f)} · updated {f.lastUpdated}
                </div>
              </>
            ) : (
              <div className="no-data-state no-data-state-drawer">
                <strong>No data</strong>
                <span>No wait posted</span>
              </div>
            )
          ) : (
            <div className="closed-state closed-state-drawer">
              <ClosedIllustration className="closed-illustration closed-drawer" />
              <strong>Closed</strong>
            </div>
          )}
        </div>

        {f.open && hasWaitData && today != null && today.usual.length >= 6 && (
          <>
            <h4 className="drawer-section-label usual-label">Typical day</h4>
            <TypicalDayBars
              usual={today.usual}
              nowHour={Math.floor(today.nowMin / 60)}
              sev={sev}
            />
          </>
        )}

        <h4 className="drawer-section-label">What to expect</h4>
        <p className="drawer-text">
          {f.open ? (
            hasWaitData ? (
              <>
                The reported wait is the latest published wait-time reading for this facility. Sicker patients are seen first, so the live wait can change quickly.
                {f.inWaitingRoom > 0 && (
                  <> Right now there are <b>{f.inWaitingRoom} people</b> in the waiting room.</>
                )}
              </>
            ) : (
              <>This facility is open, but no wait time is currently posted.</>
            )
          ) : (
            <>This facility is currently closed. It will reopen at the next scheduled time.</>
          )}
        </p>

        <h4 className="drawer-section-label">Address</h4>
        <p className="drawer-text">{f.address}</p>

        <h4 className="drawer-section-label">Hours</h4>
        <p className="drawer-text" style={{ marginBottom: 22 }}>
          {f.hours}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              className="action-btn primary"
              href={mapFacilityUrl(f, true)}
              style={{ flex: 1, justifyContent: "center" }}
              aria-label={`Directions to ${f.name}`}
              title="Directions"
            >
              <IconComponent name="directions" size={14} /> <span className="action-label">Directions</span>
            </a>
            {f.phone && (
              <a
                className="action-btn"
                href={`tel:${f.phone}`}
                style={{ flex: 1, justifyContent: "center" }}
                aria-label={`Call ${f.name} at ${f.phone}`}
                title={`Call ${f.phone}`}
              >
                <IconComponent name="phone" size={14} /> <span className="action-label">Call {f.phone}</span>
              </a>
            )}
          </div>
          {f.website && (
            <a
              className="action-btn"
              href={f.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{ justifyContent: "center" }}
              aria-label={`Website for ${f.name}`}
              title="Website"
            >
              <IconComponent name="globe" size={14} /> <span className="action-label">Visit {f.name} website</span>
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}
