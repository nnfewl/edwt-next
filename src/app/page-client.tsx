"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faGlobe,
  faChartLine,
  faCheck,
  faChevronDown,
  faCircleInfo,
  faClock,
  faServer,
  faDiamondTurnRight,
  faList,
  faLocationCrosshairs,
  faLocationDot,
  faPhone,
  faStar,
  faStethoscope,
  faTriangleExclamation,
  faUsers,
  faXmark,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { useLocale, useTranslations } from "next-intl";
import {
  type Facility,
  type HistoryPoint,
  facilityWaitStatusLabelKey,
  severityFor,
} from "./data";
import { ClosedIllustration } from "./closed-illustration";
import { withOriginDistances } from "./geo-distance";
import { HeroMapBackdrop } from "./hero-map-backdrop";
import { preciseGpsOrigin, preciseGpsOriginWithLocationText, useSessionGpsOrigin, writeSessionGpsOrigin } from "./location-session";
import { type LocationOrigin } from "./location-types";
import "./styles.css";

/* ───────── icons ─────────────────────────────────────────────────────────── */

type IconName =
  | "pin"
  | "phone"
  | "info"
  | "clock"
  | "server"
  | "users"
  | "stethoscope"
  | "directions"
  | "list"
  | "trendUp"
  | "x"
  | "star"
  | "warning"
  | "check"
  | "chevronDown"
  | "gps"
  | "external"
  | "globe";

const ICONS: Record<IconName, IconDefinition> = {
  pin: faLocationDot,
  phone: faPhone,
  info: faCircleInfo,
  clock: faClock,
  server: faServer,
  users: faUsers,
  stethoscope: faStethoscope,
  directions: faDiamondTurnRight,
  list: faList,
  trendUp: faChartLine,
  x: faXmark,
  star: faStar,
  warning: faTriangleExclamation,
  check: faCheck,
  chevronDown: faChevronDown,
  gps: faLocationCrosshairs,
  external: faArrowUpRightFromSquare,
  globe: faGlobe,
};

const Icon = ({
  name,
  size = 16,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
}) => (
  <FontAwesomeIcon
    icon={ICONS[name]}
    width={size}
    height={size}
    aria-hidden="true"
  />
);

/* ───────── ambient wave (pressure curve as card background) ──────────────── */

const WaveBackground = ({
  f,
  height = 110,
  intensity = 0.48,
}: {
  f: Facility;
  height?: number;
  intensity?: number;
}) => {
  if (f.waitMin == null) return null;
  const hist = f.history ?? [];
  if (hist.length < 2) return null;

  const W = 1000;
  const H = height;
  const maxWaitForFullWave = 720;
  const pressure = (v: number) =>
    Math.min(1, Math.max(0, v) / maxWaitForFullWave);

  const x = (i: number) => (i / (hist.length - 1)) * W;
  const amp = (v: number) => {
    const shaped = Math.pow(pressure(v), 0.75);
    return H * (0.08 + shaped * 0.8);
  };
  const baseline = H * 0.94;
  const y = (v: number) => Math.max(H * 0.08, baseline - amp(v));

  // Catmull-Rom smoothing so the curve reads as breath, not jitter.
  const buildPath = (offsetY: number, scale: number) => {
    const pts: [number, number][] = hist.map((p: HistoryPoint, i: number) => [
      x(i),
      y(p.min) + offsetY - (1 - scale) * 14,
    ]);
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
    }
    return { line: d, area: `${d} L ${W} ${H} L 0 ${H} Z` };
  };

  const back = buildPath(8, 0.85);
  const front = buildPath(0, 1);

  const sev = severityFor(f.waitMin);
  const currentPressure = pressure(f.waitMin);
  const palette = {
    short: { c: "var(--green)", op: 0.045 + currentPressure * 0.045 },
    medium: { c: "var(--amber)", op: 0.055 + currentPressure * 0.05 },
    long: { c: "var(--red)", op: 0.065 + currentPressure * 0.055 },
    closed: { c: "var(--muted)", op: 0.06 },
  }[sev];

  const gid = `wave-${f.id}`;

  return (
    <svg
      className="wave-bg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: H,
        pointerEvents: "none",
        opacity: intensity,
      }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.c} stopOpacity={palette.op * 1.4} />
          <stop offset="100%" stopColor={palette.c} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${gid}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.c} stopOpacity={palette.op * 2} />
          <stop offset="100%" stopColor={palette.c} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={back.area} fill={`url(#${gid})`} />
      <path d={front.area} fill={`url(#${gid}-front)`} />
      <path
        d={front.line}
        fill="none"
        stroke={palette.c}
        strokeWidth={1 + currentPressure * 1.05}
        strokeOpacity={0.22 + currentPressure * 0.26}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};



/* ───────── facility card ─────────────────────────────────────────────────── */

const FacilityCard = ({
  f,
  onSelect,
}: {
  f: Facility;
  onSelect: (f: Facility) => void;
}) => {
  const t = useTranslations("facilities");
  const tc = useTranslations("common");
  const sev = severityFor(f.waitMin);
  const sevLabel = tc(facilityWaitStatusLabelKey(f));
  const hasWaitData = f.waitMin != null;
  const isEm = f.type === "Emergency";

  return (
    <article
      className="facility"
      data-severity={sev}
      onClick={() => onSelect(f)}
    >
      <WaveBackground f={f} height={110} intensity={0.46} />
      <div className="left">
        <div className="badges">
          <span className={`badge ${isEm ? "emergency" : "upcc"}`}>
            <span className="bdot" />
            {isEm ? tc("emergency") : tc("upcc")}
          </span>
          <span className={"badge " + (f.open ? "open" : "closed")}>
            <span className="bdot" />
            {f.hours}
          </span>
          <span className="badge">{f.audience}</span>
        </div>

        <h3 className="name">{f.name}</h3>

        <div className="meta-row">
          <span className="subtitle-meta">{f.subtitle}</span>
          <span className="location-line">
            <span className="distance-note" aria-label={`${f.distanceKm} km away`}>
              <Icon name="pin" size={12} />
              {f.distanceKm} km
            </span>
            <span className="m address-line">
              <span className="addr-desktop">{f.address}</span>
              {f.addressStreet && (
                <>
                  <span className="addr-street">{f.addressStreet}</span>
                  {f.addressCity && <span className="addr-city">{f.addressCity}</span>}
                </>
              )}
            </span>
          </span>
          {f.open && (
            <>
              {f.inWaitingRoom > 0 && (
                <span className="m">
                  <Icon name="users" size={14} />
                  {t("waiting", { count: f.inWaitingRoom })}
                </span>
              )}
              {f.physiciansOnDuty > 0 && (
                <span className="m">
                  <Icon name="stethoscope" size={14} />
                  {t("onDuty", { count: f.physiciansOnDuty })}
                </span>
              )}
            </>
          )}
        </div>

        <div className="actions">
          <a
            className="action-btn primary"
            href={mapFacilityUrl(f, true)}
            aria-label={`Directions to ${f.name}`}
            title={t("directions")}
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="directions" size={14} /> <span className="action-label">{t("directions")}</span>
          </a>
          {f.phone && (
            <a
              className="action-btn call-btn"
              href={`tel:${f.phone}`}
              aria-label={`Call ${f.name}`}
              title={t("call")}
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="phone" size={14} /> <span className="action-label">{t("call")}</span>
            </a>
          )}
          <button
            className="action-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(f);
            }}
            aria-label={`Details for ${f.name}`}
            title={t("details")}
          >
            <Icon name="info" size={14} /> <span className="action-label">{t("details")}</span>
          </button>
        </div>
      </div>

      <div
        className={"wait " + (!f.open ? "is-closed" : !hasWaitData ? "is-no-data" : "")}
        data-sev={sev}
        aria-label={!f.open ? f.name + " is closed" : !hasWaitData ? f.name + " has no posted wait data" : undefined}
      >
        {f.open ? (
          hasWaitData ? (
            <>
              <div className="wait-num">{f.waitText}</div>
              <div className="wait-label">
                <span className="sev-dot" />
                {sevLabel}
              </div>
              <div className="updated">{tc("updated", { time: f.lastUpdated })}</div>
            </>
          ) : (
            <div className="no-data-state">
              <strong>{tc("noData")}</strong>
              <span>{t("noWaitPosted")}</span>
            </div>
          )
        ) : (
          <div className="closed-state">
            <ClosedIllustration className="closed-illustration closed-hero" />
            <strong>{tc("closed")}</strong>
          </div>
        )}
      </div>
    </article>
  );
};

/* ───────── details drawer ────────────────────────────────────────────────── */

const DetailsDrawer = ({
  f,
  onClose,
}: {
  f: Facility | null;
  onClose: () => void;
}) => {
  const t = useTranslations("facilities");
  const tc = useTranslations("common");
  const panelRef = useRef<HTMLElement>(null);
  const dragState = useRef<{ startY: number; currentY: number; dragging: boolean }>({ startY: 0, currentY: 0, dragging: false });

  useEffect(() => {
    if (!f) return;
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
  }, [f, onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!f || !panel) return;

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
  }, [f, onClose]);

  if (!f) return null;
  const sev = severityFor(f.waitMin);
  const hasWaitData = f.waitMin != null;
  const stopBubble = (e: React.MouseEvent) => e.stopPropagation();
  const waitInline: CSSProperties = {
    position: "relative",
    overflow: "hidden",
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
            {f.type === "Emergency" ? tc("emergency") : tc("upcc")}
          </span>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={tc("close")}>
            <Icon name="x" size={16} />
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
                <WaveBackground f={f} height={110} intensity={0.38} />
                <div className="wait-num" style={{ fontSize: 80 }}>
                  {f.waitText}
                </div>
                <div className="wait-label">
                  <span className="sev-dot" />
                  {tc(facilityWaitStatusLabelKey(f))} · {tc("updated", { time: f.lastUpdated })}
                </div>
              </>
            ) : (
              <div className="no-data-state no-data-state-drawer">
                <strong>{tc("noData")}</strong>
                <span>{t("noWaitPosted")}</span>
              </div>
            )
          ) : (
            <div className="closed-state closed-state-drawer">
              <ClosedIllustration className="closed-illustration closed-drawer" />
              <strong>{tc("closed")}</strong>
            </div>
          )}
        </div>

        <h4 className="drawer-section-label">{t("whatToExpect")}</h4>
        <p className="drawer-text">
          {f.open ? (
            hasWaitData ? (
              <>
                {t("expectOpen")}
                {f.inWaitingRoom > 0 && (
                  <> {t.rich("expectWaiting", { count: f.inWaitingRoom, b: (chunks) => <b>{chunks}</b> })}</>
                )}
              </>
            ) : (
              <>{t("expectNoWait")}</>
            )
          ) : (
            <>{t("expectClosed")}</>
          )}
        </p>

        <h4 className="drawer-section-label">{t("address")}</h4>
        <p className="drawer-text">{f.address}</p>

        <h4 className="drawer-section-label">{t("hours")}</h4>
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
              title={t("directions")}
            >
              <Icon name="directions" size={14} /> <span className="action-label">{t("directions")}</span>
            </a>
            {f.phone && (
              <a
                className="action-btn"
                href={`tel:${f.phone}`}
                style={{ flex: 1, justifyContent: "center" }}
                aria-label={`Call ${f.name} at ${f.phone}`}
                title={t("callPhone", { phone: f.phone })}
              >
                <Icon name="phone" size={14} /> <span className="action-label">{t("callPhone", { phone: f.phone })}</span>
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
              title={t("website")}
            >
              <Icon name="globe" size={14} /> <span className="action-label">{t("visitWebsite", { name: f.name })}</span>
            </a>
          )}
        </div>
      </aside>
    </div>
  );
};

/* ───────── page ──────────────────────────────────────────────────────────── */

const FILTERS = [
  { id: "all", labelKey: "allFacilities", ns: "facilities" },
  { id: "emergency", labelKey: "emergency", ns: "common" },
  { id: "upcc", labelKey: "walkInUpcc", ns: "facilities" },
  { id: "pediatric", labelKey: "pediatric", ns: "facilities" },
  { id: "open", labelKey: "openNow", ns: "facilities" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const SORTS = [
  { id: "wait", labelKey: "shortestWait", shortLabel: "Wait", icon: "clock", descKey: "sortWaitDesc" },
  { id: "distance", labelKey: "closestFirst", shortLabel: "Near", icon: "pin", descKey: "sortDistDesc" },
  { id: "name", labelKey: "nameAZ", shortLabel: "A-Z", icon: "list", descKey: "sortNameDesc" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

type SlidingIndicator = {
  left: number;
  width: number;
  ready: boolean;
  animate: boolean;
};

function filterMatch(f: Facility, id: FilterId): boolean {
  switch (id) {
    case "all":
      return true;
    case "emergency":
      return f.type === "Emergency";
    case "upcc":
      return f.type === "UPCC";
    case "pediatric":
      return /16 and under|pediatric/i.test(f.audience) || /pediatric/i.test(f.subtitle);
    case "open":
      return f.open;
  }
}

function mapFacilityUrl(f: Facility, route = false): string {
  const params = new URLSearchParams({ facility: f.id });
  if (route) params.set("route", "1");
  return `/map?${params.toString()}`;
}

function sortFacilities(arr: Facility[], by: SortId): Facility[] {
  const copy = [...arr];
  if (by === "wait") {
    copy.sort((a, b) => {
      if (a.waitMin == null && b.waitMin == null) return 0;
      if (a.waitMin == null) return 1;
      if (b.waitMin == null) return -1;
      return a.waitMin - b.waitMin;
    });
  } else if (by === "distance") {
    copy.sort((a, b) => a.distanceKm - b.distanceKm);
  } else if (by === "name") {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  }
  return copy;
}

function fmtMins(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h}h ${mm}m` : `${mm}m`;
}

export function ERNowPageClient({
  facilities,
  initialOrigin,
}: {
  facilities: Facility[];
  initialOrigin: LocationOrigin;
}): ReactNode {
  const t = useTranslations("facilities");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("wait");
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [selected, setSelected] = useState<Facility | null>(null);
  const filterRowRef = useRef<HTMLDivElement | null>(null);
  const sortOptionsRef = useRef<HTMLDivElement | null>(null);
  const filterRefs = useRef<Record<FilterId, HTMLButtonElement | null>>({
    all: null,
    emergency: null,
    upcc: null,
    pediatric: null,
    open: null,
  });
  const sortRefs = useRef<Record<SortId, HTMLButtonElement | null>>({
    wait: null,
    distance: null,
    name: null,
  });
  const [filterIndicator, setFilterIndicator] = useState<SlidingIndicator>({
    left: 0,
    width: 0,
    ready: false,
    animate: false,
  });
  const [sortIndicator, setSortIndicator] = useState<SlidingIndicator>({
    left: 0,
    width: 0,
    ready: false,
    animate: false,
  });
  // Store ONLY a GPS override locally; fall back to the prop so server-side IP
  // geolocation updates flow in on refresh without resetting a user's GPS choice.
  const [gpsOrigin, setGpsOrigin] = useSessionGpsOrigin();
  const origin: LocationOrigin = gpsOrigin ?? initialOrigin;
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "denied" | "unavailable" | "insecure">("idle");
  // Time is rendered client-side to avoid an SSR/CSR mismatch on the hero meta.
  const [now, setNow] = useState<Date | null>(null);

  // Render the clock client-only to dodge SSR mismatch; tick on a 1-min cadence.
  // The first read is deferred via setTimeout so the effect body itself never
  // calls setState synchronously (lint: react-hooks/set-state-in-effect).
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const button = filterRefs.current[filter];
      if (!button) return null;
      return { left: button.offsetLeft, width: button.offsetWidth };
    };

    const current = measure();
    if (!current) return undefined;

    let firstFrame = 0;
    setFilterIndicator((state) => {
      if (state.ready) return { ...current, ready: true, animate: true };
      firstFrame = window.requestAnimationFrame(() => {
        setFilterIndicator((state) => ({ ...state, animate: true }));
      });
      return { ...current, ready: true, animate: false };
    });

    const activeButton = filterRefs.current[filter];
    const resizeObserver = new ResizeObserver(() => {
      const next = measure();
      if (next) setFilterIndicator({ ...next, ready: true, animate: false });
    });

    if (filterRowRef.current) resizeObserver.observe(filterRowRef.current);
    if (activeButton) resizeObserver.observe(activeButton);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      resizeObserver.disconnect();
    };
  }, [filter]);

  useLayoutEffect(() => {
    const measure = () => {
      const button = sortRefs.current[sort];
      if (!button) return null;
      return { left: button.offsetLeft, width: button.offsetWidth };
    };

    const current = measure();
    if (!current) return undefined;

    let firstFrame = 0;
    setSortIndicator((state) => {
      if (state.ready) return { ...current, ready: true, animate: true };
      firstFrame = window.requestAnimationFrame(() => {
        setSortIndicator((state) => ({ ...state, animate: true }));
      });
      return { ...current, ready: true, animate: false };
    });

    const activeButton = sortRefs.current[sort];
    const resizeObserver = new ResizeObserver(() => {
      const next = measure();
      if (next) setSortIndicator({ ...next, ready: true, animate: false });
    });

    if (sortOptionsRef.current) resizeObserver.observe(sortOptionsRef.current);
    if (activeButton) resizeObserver.observe(activeButton);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      resizeObserver.disconnect();
    };
  }, [sort]);

  const activeSort = SORTS.find((s) => s.id === sort) ?? SORTS[0];
  const locationModeLabel = origin.source === "gps" ? t("preciseLocation") : t("approximateLocation");
  const locationText = origin.label;
  const locationStatus = geoStatus === "denied"
    ? t("locationDenied")
    : geoStatus === "insecure"
      ? t("gpsNeedsHttps")
      : geoStatus === "unavailable"
        ? t("locationUnavailable")
        : null;
  const locationButtonLabel = geoStatus === "locating"
    ? t("gettingLocation")
    : origin.source === "gps"
      ? t("preciseEnabled")
      : t("usePreciseLocation");
  const heroDate = now?.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }) ?? "Monday, January 1";
  const heroTime = now?.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  }) ?? "12:00 AM";

  const requestPreciseLocation = () => {
    if (!window.isSecureContext) {
      setGeoStatus("insecure");
      return;
    }

    if (!("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      return;
    }

    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const nextOrigin = await preciseGpsOriginWithLocationText(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy,
          );
          setGpsOrigin(nextOrigin);
          writeSessionGpsOrigin(nextOrigin);
        } catch {
          // Reverse-geocode failed — still use the coordinates.
          const nextOrigin = preciseGpsOrigin(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy,
          );
          setGpsOrigin(nextOrigin);
          writeSessionGpsOrigin(nextOrigin);
        }
        setGeoStatus("idle");
      },
      (error) => {
        setGeoStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 },
    );
  };

  const facilitiesWithDistance = useMemo(
    () => withOriginDistances(facilities, origin),
    [facilities, origin],
  );

  useEffect(() => {
    if (!sortSheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSortSheetOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sortSheetOpen]);

  const filtered = useMemo(() => {
    const matched = facilitiesWithDistance.filter((f) => filterMatch(f, filter));
    return sortFacilities(matched, sort);
  }, [facilitiesWithDistance, filter, sort]);

  const counts = useMemo(() => {
    const c: Record<FilterId, number> = {
      all: 0,
      emergency: 0,
      upcc: 0,
      pediatric: 0,
      open: 0,
    };
    for (const { id } of FILTERS) {
      c[id] = facilitiesWithDistance.filter((f) => filterMatch(f, id)).length;
    }
    return c;
  }, [facilitiesWithDistance]);

  // All derived "open right now" values are nullable so a zero-open-facilities
  // state — overnight UPCC closure, regional outage, fresh empty DB — renders
  // an empty state instead of dereferencing undefined.
  const openFacilities = useMemo(
    () => facilitiesWithDistance.filter((f) => f.open),
    [facilitiesWithDistance],
  );
  const openWaitFacilities = useMemo(
    () => openFacilities.filter((f) => f.waitMin != null),
    [openFacilities],
  );
  const shortest = useMemo(() => {
    if (openWaitFacilities.length === 0) return null;
    return openWaitFacilities.reduce(
      (a, b) => ((b.waitMin ?? Infinity) < (a.waitMin ?? Infinity) ? b : a),
      openWaitFacilities[0],
    );
  }, [openWaitFacilities]);
  const closestOpen = useMemo(() => {
    if (openFacilities.length === 0) return null;
    return [...openFacilities].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  }, [openFacilities]);
  const avgWait = useMemo(() => {
    if (openWaitFacilities.length === 0) return null;
    const total = openWaitFacilities.reduce((s, f) => s + (f.waitMin ?? 0), 0);
    return Math.round(total / openWaitFacilities.length);
  }, [openWaitFacilities]);

  return (
    <div className="er-now-root">
      <main className="page">
        {/* Hero */}
        <section className="hero">
          <HeroMapBackdrop
            className="hero-map"
            pictureClassName="hero-map-picture"
            imageClassName="hero-map-image"
            originLat={origin.source !== "fallback" ? origin.lat : undefined}
            originLng={origin.source !== "fallback" ? origin.lng : undefined}
          />
          <div>
            <h1>
              {t.rich("heroTitle", { em: (chunks) => <em>{chunks}</em> })}
            </h1>
            <p className="hero-sub">
              {t("heroSub")}
            </p>
          </div>
          <div className="hero-meta">
            <div className="locator">
              <span className="pin" aria-hidden="true">
                <Icon name="pin" size={18} />
              </span>
              <div className="loc-body">
                <div className="loc-label">{locationModeLabel}</div>
                <div className="loc-addr">{locationText}</div>
                {locationStatus && <div className="loc-status">{locationStatus}</div>}
              </div>
              <button
                className={`change gps-action ${origin.source === "gps" ? "active" : ""}`}
                type="button"
                onClick={requestPreciseLocation}
                disabled={geoStatus === "locating"}
                aria-label={locationButtonLabel}
                title={locationButtonLabel}
              >
                <Icon name="gps" size={15} />
              </button>
            </div>
            <div className={`hero-clock ${now ? "" : "is-pending"}`} aria-hidden={!now}>
              <span>{heroDate}</span>
              <span>·</span>
              <span>{heroTime}</span>
            </div>
          </div>
        </section>

        {/* Emergency banner */}
        <div className="info-banner" role="alert">
          <span className="ico"><Icon name="warning" size={13} /></span>
          <div className="b-body">
            <strong>{t("emergencyBannerStrong")}</strong>{" "}
            {t.rich("emergencyBannerBody", { healthLink: (chunks) => <a href="tel:811">{chunks}</a> })}
          </div>
        </div>

        {/* Stats — only meaningful when at least one facility is open */}
        {shortest && closestOpen && avgWait != null ? (
          <>
            <div className="stats">
              <div className="stat">
                <div className="stat-label">{t("statShortestWait")}</div>
                <div className="stat-value">{fmtMins(shortest.waitMin ?? 0)}</div>
                <div className="stat-trend down">
                  {shortest.name.split(" ").slice(0, 2).join(" ")} · {shortest.subtitle}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">{t("statClosestOpen")}</div>
                <div className="stat-value">
                  {closestOpen.distanceKm}
                  <span className="unit">km</span>
                </div>
                <div className="stat-trend">
                  {closestOpen.name.split(" ").slice(0, 2).join(" ")}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">{t("statAverageWait")}</div>
                <div className="stat-value">{fmtMins(avgWait)}</div>
                <div className="stat-trend">
                  {t("acrossOpen", { count: openWaitFacilities.length })}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">{t("statOpenNow")}</div>
                <div className="stat-value">
                  {openFacilities.length}
                  <span className="unit">/ {facilitiesWithDistance.length}</span>
                </div>
                <div className="stat-trend">{t("facilitiesReporting")}</div>
              </div>
            </div>
            <p className="stats-summary">
              {t.rich("statsSummary", {
                openCount: openFacilities.length,
                totalCount: facilitiesWithDistance.length,
                shortest: fmtMins(shortest.waitMin ?? 0),
                average: fmtMins(avgWait),
                b: (chunks) => <b>{chunks}</b>,
              })}
            </p>
          </>
        ) : (
          <div className="info-banner" role="status">
            <span className="ico"><Icon name="warning" size={13} /></span>
            <div className="b-body">
              <strong>{openFacilities.length === 0 ? t("noFacilitiesOpen") : t("noWaitTimes")}</strong>{" "}
              {openFacilities.length === 0
                ? t("feedPaused")
                : t("noWaitData")}{" "}
              {t.rich("nurseAdvice", {
                healthLink: (chunks) => <a href="tel:811">{chunks}</a>,
                emergencyLink: (chunks) => <a href="tel:911">{chunks}</a>,
              })}
            </div>
          </div>
        )}

        {/* Recommended pick — only when there's an open facility to recommend */}
        {shortest && (
          <div className="best-pick">
            <WaveBackground f={shortest} height={120} intensity={0.32} />
            <span className="pick-eyebrow">
              <Icon name="star" size={11} stroke={2} />
              {t("recommendedForYou")}
            </span>
            <div className="pick-body">
              <div className="pick-info">
                <h2 className="pick-name">
                  {shortest.name}
                  <span className="pick-sub">{shortest.subtitle}</span>
                </h2>
                <p className="pick-reason">
                  {t("shortestReportedWait", { wait: fmtMins(shortest.waitMin ?? 0) })}
                  {shortest.inWaitingRoom > 0 && (
                    <> {t.rich("withWaiting", { count: shortest.inWaitingRoom, b: (chunks) => <b>{chunks}</b> })}</>
                  )}
                  {" "}{t("kmFromLocation", { distance: shortest.distanceKm })}
                </p>
                <div className="pick-meta">
                  <span>
                    <Icon name="clock" size={13} /> {shortest.hours}
                  </span>
                  <span>
                    <Icon name="users" size={13} /> {shortest.audience}
                  </span>
                  {shortest.physiciansOnDuty > 0 && (
                    <span>
                      <Icon name="stethoscope" size={13} /> {t("cliniciansOnDuty", { count: shortest.physiciansOnDuty })}
                    </span>
                  )}
                </div>
                <div className="actions" style={{ marginTop: 20 }}>
                  <a
                    className="action-btn primary"
                    href={mapFacilityUrl(shortest, true)}
                    aria-label={`Directions to ${shortest.name}`}
                    title={t("directions")}
                  >
                    <Icon name="directions" size={14} /> <span className="action-label">{t("directions")}</span>
                  </a>
                  <button
                    className="action-btn"
                    type="button"
                    onClick={() => setSelected(shortest)}
                    aria-label={`Full details for ${shortest.name}`}
                    title={t("fullDetails")}
                  >
                    <Icon name="info" size={14} /> <span className="action-label">{t("fullDetails")}</span>
                  </button>
                </div>
              </div>
              <div className={"wait " + (!shortest.open ? "is-closed" : "")} data-sev={severityFor(shortest.waitMin)} aria-label={shortest.open ? undefined : shortest.name + " is closed"}>
                {shortest.open ? (
                  <>
                    <div className="wait-num">{shortest.waitText}</div>
                    <div className="wait-label">
                      <span className="sev-dot" />
                      {tc(facilityWaitStatusLabelKey(shortest))}
                    </div>
                    <div className="updated">{tc("updated", { time: shortest.lastUpdated })}</div>
                  </>
                ) : (
                  <div className="closed-state">
                    <ClosedIllustration className="closed-illustration closed-hero" />
                    <strong>{tc("closed")}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Filter toolbar */}
        <div className="toolbar">
          <div
            className={`chip-row${filterIndicator.ready ? " is-ready" : ""}`}
            role="group"
            aria-label={t("facilityFilters")}
            ref={filterRowRef}
          >
            <span
              className={`chip-active-indicator${filterIndicator.ready ? " is-ready" : ""}${filterIndicator.animate ? " is-animated" : ""}`}
              style={{ width: filterIndicator.width, transform: `translateX(${filterIndicator.left}px)` }}
              aria-hidden="true"
            />
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`chip ${filter === f.id ? "active" : ""}`}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                ref={(node) => {
                  filterRefs.current[f.id] = node;
                }}
              >
                {f.ns === "common" ? tc(f.labelKey) : t(f.labelKey)}
                <span className="count">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <div className="spacer-flex" />
          <div className="sort-control" role="group" aria-label={t("sortFacilities")}>
            <span className="sort-label">{t("sort")}</span>
            <div
              className={`sort-options${sortIndicator.ready ? " is-ready" : ""}`}
              ref={sortOptionsRef}
            >
              <span
                className={`sort-active-indicator${sortIndicator.ready ? " is-ready" : ""}${sortIndicator.animate ? " is-animated" : ""}`}
                style={{ width: sortIndicator.width, transform: `translateX(${sortIndicator.left}px)` }}
                aria-hidden="true"
              />
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  className={`sort-option ${sort === s.id ? "active" : ""}`}
                  type="button"
                  aria-pressed={sort === s.id}
                  aria-label={t(s.labelKey)}
                  title={t(s.labelKey)}
                  onClick={() => setSort(s.id)}
                  ref={(node) => {
                    sortRefs.current[s.id] = node;
                  }}
                >
                  <Icon name={s.icon} size={13} />
                  <span>{s.shortLabel}</span>
                </button>
              ))}
            </div>
          </div>
          <button
            className="sort-trigger"
            type="button"
            aria-haspopup="dialog"
            aria-expanded={sortSheetOpen}
            onClick={() => setSortSheetOpen(true)}
          >
            <span className="sort-trigger-icon"><Icon name={activeSort.icon} size={14} /></span>
            <span>
              <small>{t("sortedBy")}</small>
              <strong>{t(activeSort.labelKey)}</strong>
            </span>
            <Icon name="chevronDown" size={12} />
          </button>
        </div>

        {sortSheetOpen && (
          <div className="sort-sheet-scrim" role="presentation" onClick={() => setSortSheetOpen(false)}>
            <section
              className="sort-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sort-sheet-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sort-sheet-handle" aria-hidden="true" />
              <div className="sort-sheet-head">
                <div>
                  <p>{t("sortFacilities")}</p>
                  <h2 id="sort-sheet-title">{t("chooseOrder")}</h2>
                </div>
                <button type="button" className="sort-sheet-close" aria-label={tc("close")} onClick={() => setSortSheetOpen(false)}>
                  <Icon name="x" size={15} />
                </button>
              </div>
              <div className="sort-sheet-options">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    className={`sort-sheet-option ${sort === s.id ? "active" : ""}`}
                    type="button"
                    aria-pressed={sort === s.id}
                    onClick={() => {
                      setSort(s.id);
                      setSortSheetOpen(false);
                    }}
                  >
                    <span className="sort-sheet-option-icon"><Icon name={s.icon} size={16} /></span>
                    <span className="sort-sheet-option-copy">
                      <strong>{t(s.labelKey)}</strong>
                      <small>{t(s.descKey)}</small>
                    </span>
                    {sort === s.id && <Icon name="check" size={15} />}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* List */}
        <div className="facility-list">
          {filtered.map((f) => (
            <FacilityCard key={f.id} f={f} onSelect={setSelected} />
          ))}
          {filtered.length === 0 && (
            <div
              style={{
                padding: 48,
                textAlign: "center",
                color: "var(--muted)",
                border: "1px dashed var(--line)",
                borderRadius: "var(--radius)",
              }}
            >
              {t("noMatch")}
              <button className="empty-reset" type="button" onClick={() => setFilter("all")}>
                {t("showAll")}
              </button>
            </div>
          )}
        </div>

        {/* Advice */}
        <section className="advice-grid">
          <div className="advice-card">
            <div className="a-num">01</div>
            <h3>{t("advice01Title")}</h3>
            <p>{t("advice01Body")}</p>
            <a href="tel:811">{t("advice01Link")}</a>
          </div>
          <div className="advice-card">
            <div className="a-num">02</div>
            <h3>{t("advice02Title")}</h3>
            <p>{t("advice02Body")}</p>
          </div>
          <div className="advice-card">
            <div className="a-num">03</div>
            <h3>{t("advice03Title")}</h3>
            <p>{t("advice03Body")}</p>
          </div>
        </section>

        <footer className="site-footer">
          <div className="footer-bar">
            <div className="footer-brand">
              <span className="footer-mark" aria-hidden="true">
                <Icon name="stethoscope" size={16} />
              </span>
              <div className="footer-brand-text">
                <strong>EDWT</strong>
                <span>{t("footerTagline")}</span>
              </div>
            </div>
            <div className="footer-meta">
              <a
                className="footer-link"
                href="https://www.edwaittimes.ca/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="source-badge-icon" aria-hidden="true">
                  <svg role="presentation" viewBox="0 0 16 16" fill="currentColor" width={15} height={15} aria-hidden="true"><path d="M2.9 1.84C3.22 1.57 3.69 1.62 3.95 1.94C4.22 2.25 4.17 2.73 3.86 2.99C2.42 4.18 1.5 5.99 1.5 8C1.5 10.01 2.42 11.81 3.86 13.01C4.17 13.27 4.22 13.74 3.95 14.06C3.69 14.38 3.22 14.43 2.9 14.16C1.13 12.7 0 10.48 0 8C0 5.52 1.13 3.3 2.9 1.84ZM12.04 1.94C12.31 1.62 12.78 1.57 13.1 1.84C14.87 3.3 16 5.52 16 8C16 10.48 14.87 12.7 13.1 14.16C12.78 14.43 12.31 14.38 12.04 14.06C11.78 13.74 11.82 13.27 12.14 13.01C13.58 11.81 14.5 10.01 14.5 8C14.5 5.99 13.58 4.18 12.14 2.99C11.82 2.73 11.78 2.25 12.04 1.94ZM4.81 4.15C5.13 3.88 5.6 3.93 5.87 4.25C6.13 4.57 6.09 5.04 5.77 5.3C4.99 5.95 4.5 6.92 4.5 8C4.5 9.08 4.99 10.05 5.77 10.7C6.09 10.96 6.13 11.43 5.87 11.75C5.6 12.07 5.13 12.12 4.81 11.85C3.71 10.94 3 9.55 3 8C3 6.45 3.71 5.06 4.81 4.15ZM10.13 4.25C10.4 3.93 10.87 3.88 11.19 4.15C12.29 5.06 13 6.45 13 8C13 9.55 12.29 10.94 11.19 11.85C10.87 12.11 10.4 12.07 10.13 11.75C9.87 11.43 9.91 10.96 10.23 10.7C11.01 10.05 11.5 9.08 11.5 8C11.5 6.92 11.01 5.95 10.23 5.3C9.91 5.04 9.87 4.57 10.13 4.25ZM8 6C9.1 6 10 6.9 10 8C10 9.1 9.1 10 8 10C6.9 10 6 9.1 6 8C6 6.9 6.9 6 8 6Z"/></svg>
                </span>
                <span className="footer-link-label source-badge-label">
                  <strong>edwaittimes.ca</strong>
                </span>
                <Icon name="external" size={11} />
              </a>
              <a
                className="footer-link status"
                href="https://status.edwt.ca"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="footer-link-label">
                  <span className="status-dot" aria-hidden="true" />
                  {t("serviceStatus")}
                </span>
                <Icon name="external" size={11} />
              </a>
            </div>
          </div>
          <p className="footnote">
            {t("footnote")}
          </p>
        </footer>
      </main>

      <DetailsDrawer f={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
