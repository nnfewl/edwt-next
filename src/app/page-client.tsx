"use client";

import dynamic from "next/dynamic";
import {
  Fragment,
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import {
  type Facility,
  type HistoryPoint,
  facilityWaitStatusLabel,
  isStaleReading,
  severityFor,
} from "./data";
import { ClosedIllustration } from "./closed-illustration";
import type { DetailsDrawerProps } from "./details-drawer-client";
import { withOriginDistances } from "./geo-distance";
import { HeroMapBackdrop } from "./hero-map-backdrop";
import { preciseGpsOrigin, preciseGpsOriginWithLocationText, readSessionGpsOrigin, useSessionGpsOrigin, writeSessionGpsOrigin } from "./location-session";
import { type LocationOrigin } from "./location-types";
import "./styles.css";

const DetailsDrawer = dynamic<DetailsDrawerProps>(
  () => import("./details-drawer-client").then((mod) => mod.DetailsDrawer),
  { ssr: false },
);

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

type WavePoint = { t: number; min: number; lo?: number; hi?: number };

const WaveBackground = ({
  f,
  height = 110,
  intensity = 0.48,
  actual,
  projected,
  className,
  gidSuffix = "",
  pinnedWindowMax,
}: {
  f: Facility;
  height?: number;
  intensity?: number;
  /** When set, the wave plots today's readings on a midnight-to-midnight axis. */
  actual?: WavePoint[];
  projected?: WavePoint[];
  className?: string;
  /** Keeps gradient ids unique when two waves for one facility are stacked. */
  gidSuffix?: string;
  /** Locks the amplitude scale so a stacked wipe pair shares one seam-aligned scale. */
  pinnedWindowMax?: number;
}) => {
  if (f.waitMin == null) return null;
  // A reporting gap longer than this is left blank instead of bridged with a
  // confident-looking ramp — sparse rural EDs post roughly hourly and can go
  // silent overnight for hours.
  const GAP_SPLIT_MIN = 90;
  // Pin today's wave to the left edge: extend the first reading back to
  // midnight — unless the day starts with a long silent gap.
  const todayPts =
    actual && actual.length > 0 && actual[0].t > 0 && actual[0].t <= GAP_SPLIT_MIN
      ? [{ t: 0, min: actual[0].min }, ...actual]
      : actual;
  const hist: WavePoint[] =
    todayPts ?? (f.history ?? []).map((p: HistoryPoint, i: number) => ({ t: i, min: p.min }));
  if (hist.length < 2) return null;

  const W = 1000;
  const H = height;
  const span = actual ? 1440 : hist.length - 1;
  const maxWaitForFullWave = 720;
  const pressure = (v: number) =>
    Math.min(1, Math.max(0, v) / maxWaitForFullWave);

  const x = (t: number) => (t / span) * W;
  // Hybrid scale: normalize to this facility's own window so small waits still
  // show shape, but clamp so a 40-minute peak never towers like a 6-hour one.
  // Deliberately scaled to actuals only: including the projection would make
  // the solid wave shrink a step when the forecast loads in.
  const windowMax = pinnedWindowMax ?? Math.max(1, ...hist.map((p) => p.min));
  const scaleMax = Math.min(720, Math.max(120, windowMax * 1.2));
  const amp = (v: number) => {
    const shaped = Math.pow(Math.max(0, v) / scaleMax, 0.75);
    return H * (0.08 + shaped * 0.8);
  };
  const baseline = H * 0.94;
  const y = (v: number) => Math.max(H * 0.08, baseline - amp(v));

  // Catmull-Rom smoothing so the curve reads as breath, not jitter. Control
  // points are clamped to each segment's y-range so cliffs in the data can't
  // overshoot into curls. Coordinates are rounded so server and client render
  // identical path strings (raw Math.pow output can differ by 1 ulp between
  // Node and the browser).
  const fmt = (n: number) => n.toFixed(2);
  const buildPath = (points: WavePoint[], offsetY: number, scale: number) => {
    const pts: [number, number][] = points.map((p) => [
      x(p.t),
      y(p.min) + offsetY - (1 - scale) * 14,
    ]);
    let d = `M ${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const yLo = Math.min(p1[1], p2[1]);
      const yHi = Math.max(p1[1], p2[1]);
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = Math.min(yHi, Math.max(yLo, p1[1] + (p2[1] - p0[1]) / 6));
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = Math.min(yHi, Math.max(yLo, p2[1] - (p3[1] - p1[1]) / 6));
      d += ` C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2[0])} ${fmt(p2[1])}`;
    }
    const first = fmt(pts[0][0]);
    const last = fmt(pts[pts.length - 1][0]);
    return { line: d, area: `${d} L ${last} ${H} L ${first} ${H} Z` };
  };

  // Split today's readings into contiguous runs; long silent stretches stay
  // blank. The 12h card wave uses index-spaced points, so it never splits.
  const runs: WavePoint[][] = [];
  {
    let cur: WavePoint[] = [];
    for (const p of hist) {
      if (cur.length > 0 && actual && p.t - cur[cur.length - 1].t > GAP_SPLIT_MIN) {
        runs.push(cur);
        cur = [];
      }
      cur.push(p);
    }
    runs.push(cur);
  }
  const segs = runs.filter((r) => r.length >= 2);
  const backs = segs.map((r) => buildPath(r, 8, 0.85));
  const fronts = segs.map((r) => buildPath(r, 0, 1));

  const lastPt = hist[hist.length - 1];
  // Pin the projection to the right edge: extend the last point to midnight.
  const projPts =
    projected && projected.length > 0 && projected[projected.length - 1].t < 1440
      ? [...projected, { ...projected[projected.length - 1], t: 1440 }]
      : projected;
  const proj =
    actual && projPts && projPts.length > 0
      ? buildPath([lastPt, ...projPts], 0, 1)
      : null;


  const sev = severityFor(f.waitMin);
  const currentPressure = pressure(f.waitMin);
  const palette = {
    short: { c: "var(--green)", op: 0.045 + currentPressure * 0.045 },
    medium: { c: "var(--amber)", op: 0.055 + currentPressure * 0.05 },
    long: { c: "var(--red)", op: 0.065 + currentPressure * 0.055 },
    closed: { c: "var(--muted)", op: 0.06 },
  }[sev];

  const gid = `wave-${f.id}${gidSuffix}`;

  return (
    <svg
      className={className ? `wave-bg ${className}` : "wave-bg"}
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
        <linearGradient id={`${gid}-ghost`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.c} stopOpacity={palette.op * 0.9} />
          <stop offset="100%" stopColor={palette.c} stopOpacity={0.01} />
        </linearGradient>
      </defs>
      {backs.map((b, i) => (
        <path key={`b${i}`} d={b.area} fill={`url(#${gid})`} />
      ))}
      {fronts.map((p, i) => (
        <Fragment key={`s${i}`}>
          <path d={p.area} fill={`url(#${gid}-front)`} />
          <path
            d={p.line}
            fill="none"
            stroke={palette.c}
            strokeWidth={1 + currentPressure * 1.05}
            strokeOpacity={0.22 + currentPressure * 0.26}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Fragment>
      ))}
      {proj && (
        <g className="wave-proj" key={f.id}>
          <path d={proj.area} fill={`url(#${gid}-ghost)`} />
          <line
            x1={fmt(x(lastPt.t))}
            x2={fmt(x(lastPt.t))}
            y1={H * 0.06}
            y2={H * 0.94}
            stroke="var(--muted)"
            strokeWidth={1}
            strokeOpacity={0.3}
            strokeDasharray="3 5"
          />
          <path
            d={proj.line}
            fill="none"
            stroke={palette.c}
            strokeWidth={1.4 + currentPressure * 0.8}
            strokeOpacity={0.45}
            strokeDasharray="2 8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
};



/* ───────── facility card ─────────────────────────────────────────────────── */

const FacilityCard = ({
  f,
  onSelect,
  nowMs,
}: {
  f: Facility;
  onSelect: (f: Facility) => void;
  /** Client-side clock (null during SSR) so stale flags never mismatch on hydration. */
  nowMs: number | null;
}) => {
  const sev = severityFor(f.waitMin);
  const sevLabel = facilityWaitStatusLabel(f);
  const hasWaitData = f.waitMin != null;
  const stale = f.open && hasWaitData && nowMs != null && isStaleReading(f.observedAtMs, nowMs);
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
            {isEm ? "Emergency" : "UPCC"}
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
        </div>

        <div className="actions">
          <a
            className="action-btn primary"
            href={mapFacilityUrl(f, true)}
            aria-label={`Directions to ${f.name}`}
            title="Directions"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="directions" size={14} /> <span className="action-label">Directions</span>
          </a>
          {f.phone && (
            <a
              className="action-btn call-btn"
              href={`tel:${f.phone}`}
              aria-label={`Call ${f.name}`}
              title="Call"
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="phone" size={14} /> <span className="action-label">Call</span>
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
            title="Details"
          >
            <Icon name="info" size={14} /> <span className="action-label">Details</span>
          </button>
        </div>
      </div>

      <div
        className={"wait " + (!f.open ? "is-closed" : !hasWaitData ? "is-no-data" : "")}
        data-sev={sev}
        data-stale={stale || undefined}
        aria-label={!f.open ? f.name + " is closed" : !hasWaitData ? f.name + " has no posted wait data" : undefined}
      >
        {f.open ? (
          hasWaitData ? (
            <>
              <div className="wait-num">{f.waitText}</div>
              <div className="wait-label">
                <span className="sev-dot" />
                {stale ? "Stale reading" : sevLabel}
              </div>
              <div className="updated">Updated {f.lastUpdated}</div>
            </>
          ) : (
            <div className="no-data-state">
              <strong>No data</strong>
              <span>No wait posted</span>
            </div>
          )
        ) : (
          <div className="closed-state">
            <ClosedIllustration className="closed-illustration closed-hero" />
            <strong>Closed</strong>
          </div>
        )}
      </div>
    </article>
  );
};

/* ───────── page ──────────────────────────────────────────────────────────── */

const INITIAL_VISIBLE = 10;

const FILTERS = [
  { id: "all", label: "All facilities" },
  { id: "emergency", label: "Emergency" },
  { id: "upcc", label: "Walk-in / UPCC" },
  { id: "pediatric", label: "Pediatric" },
  { id: "open", label: "Open now" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const SORTS = [
  { id: "wait", label: "Shortest wait", shortLabel: "Wait", icon: "clock", description: "Prioritize sites reporting the lowest current wait." },
  { id: "distance", label: "Closest first", shortLabel: "Near", icon: "pin", description: "Show the nearest open facilities first." },
  { id: "name", label: "Name A-Z", shortLabel: "A-Z", icon: "list", description: "Browse facilities alphabetically." },
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

function isLocationOrigin(value: unknown): value is LocationOrigin {
  if (typeof value !== "object" || value === null) return false;
  const origin = value as Partial<LocationOrigin>;
  const validSource = origin.source === "ip" || origin.source === "gps" || origin.source === "fallback";
  const validAccuracy =
    origin.accuracyMeters === undefined ||
    origin.accuracyMeters === null ||
    (typeof origin.accuracyMeters === "number" && Number.isFinite(origin.accuracyMeters));

  return (
    typeof origin.lat === "number" &&
    Number.isFinite(origin.lat) &&
    typeof origin.lng === "number" &&
    Number.isFinite(origin.lng) &&
    typeof origin.label === "string" &&
    validSource &&
    typeof origin.accuracyLabel === "string" &&
    validAccuracy
  );
}

export function ERNowPageClient({
  facilities,
  initialOrigin,
}: {
  facilities: Facility[];
  initialOrigin: LocationOrigin;
}): ReactNode {
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
  // Store ONLY a GPS override locally; the server-rendered fallback origin stays
  // shared so the homepage can be cached across visitors. IP-derived origin is
  // fetched after hydration through a tiny dynamic endpoint, and GPS still wins.
  const [gpsOrigin, setGpsOrigin] = useSessionGpsOrigin();
  const [ipOrigin, setIpOrigin] = useState<LocationOrigin | null>(null);
  const origin: LocationOrigin = gpsOrigin ?? ipOrigin ?? initialOrigin;
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

  useEffect(() => {
    if (gpsOrigin) return undefined;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      // Let the session GPS hook read storage first. If a precise origin exists,
      // skip the IP lookup entirely rather than briefly replacing it.
      if (readSessionGpsOrigin()) return;

      fetch("/api/location-origin", { cache: "no-store", signal: controller.signal })
        .then((response) => (response.ok ? response.json() as Promise<unknown> : null))
        .then((payload) => {
          if (isLocationOrigin(payload) && payload.source !== "gps") setIpOrigin(payload);
        })
        .catch(() => {
          // Keep the shared fallback origin if the browser aborts or the endpoint fails.
        });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [gpsOrigin]);

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
  const locationModeLabel = origin.source === "gps" ? "Precise location" : "Approximate location";
  const locationText = origin.label;
  const locationStatus = geoStatus === "denied"
    ? "Location permission was denied"
    : geoStatus === "insecure"
      ? "GPS needs HTTPS on mobile devices"
      : geoStatus === "unavailable"
        ? "Precise location is unavailable"
        : null;
  const locationButtonLabel = geoStatus === "locating"
    ? "Getting precise location"
    : origin.source === "gps"
      ? "Precise location enabled"
      : "Use precise location";
  const heroDate = now?.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }) ?? "Monday, January 1";
  const heroTime = now?.toLocaleTimeString([], {
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

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  // Reset progressive rendering when the visible set changes. Adjusting state
  // during render (not in an effect) avoids painting a stale list first.
  const [prevFilterSort, setPrevFilterSort] = useState<[FilterId, SortId]>([filter, sort]);
  if (prevFilterSort[0] !== filter || prevFilterSort[1] !== sort) {
    setPrevFilterSort([filter, sort]);
    setVisibleCount(INITIAL_VISIBLE);
  }
  useEffect(() => {
    if (visibleCount < filtered.length) {
      startTransition(() => setVisibleCount(filtered.length));
    }
  }, [filtered, visibleCount]);

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
              Find the <em>shortest</em>{" "}
              <br />
              ED wait near you.
            </h1>
            <p className="hero-sub">
              Live wait times for emergency departments and walk-in clinics from the live EDWT feed. Updated every few minutes.
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
            <strong>If this is a life-threatening emergency, call 9-1-1.</strong>{" "}
            Chest pain, severe bleeding, stroke symptoms, or difficulty breathing
            need immediate care. For non-urgent health advice, dial{" "}
            <a href="tel:811">8-1-1</a> to reach a registered nurse 24/7.
          </div>
        </div>

        {/* Stats — only meaningful when at least one facility is open */}
        {shortest && closestOpen && avgWait != null ? (
          <>
            <div className="stats">
              <div className="stat">
                <div className="stat-label">Shortest wait</div>
                <div className="stat-value">{fmtMins(shortest.waitMin ?? 0)}</div>
                <div className="stat-trend down">
                  {shortest.name.split(" ").slice(0, 2).join(" ")} · {shortest.subtitle}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">Closest open</div>
                <div className="stat-value">
                  {closestOpen.distanceKm}
                  <span className="unit">km</span>
                </div>
                <div className="stat-trend">
                  {closestOpen.name.split(" ").slice(0, 2).join(" ")}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">Average wait now</div>
                <div className="stat-value">{fmtMins(avgWait)}</div>
                <div className="stat-trend">
                  across {openWaitFacilities.length} open
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">Open right now</div>
                <div className="stat-value">
                  {openFacilities.length}
                  <span className="unit">/ {facilitiesWithDistance.length}</span>
                </div>
                <div className="stat-trend">facilities reporting</div>
              </div>
            </div>
            <p className="stats-summary">
              <b>{openFacilities.length}</b> of {facilitiesWithDistance.length} facilities
              open · shortest <b>{fmtMins(shortest.waitMin ?? 0)}</b> ·
              average <b>{fmtMins(avgWait)}</b>
            </p>
          </>
        ) : (
          <div className="info-banner" role="status">
            <span className="ico"><Icon name="warning" size={13} /></span>
            <div className="b-body">
              <strong>{openFacilities.length === 0 ? "No facilities are currently reporting as open." : "No posted wait times are available right now."}</strong>{" "}
              {openFacilities.length === 0
                ? "The live feed may be paused or every site in range is closed."
                : "Open facilities may still be accepting patients, but the live feed has not posted wait data."}{" "}
              Call <a href="tel:811">8-1-1</a> for nurse advice, or{" "}
              <a href="tel:911">9-1-1</a> if this is life-threatening.
            </div>
          </div>
        )}

        {/* Recommended pick — only when there's an open facility to recommend */}
        {shortest && (
          <div className="best-pick">
            <WaveBackground f={shortest} height={120} intensity={0.32} />
            <span className="pick-eyebrow">
              <Icon name="star" size={11} stroke={2} />
              Recommended for you
            </span>
            <div className="pick-body">
              <div className="pick-info">
                <h2 className="pick-name">
                  {shortest.name}
                  <span className="pick-sub">{shortest.subtitle}</span>
                </h2>
                <p className="pick-reason">
                  Shortest reported wait among open facilities — about a{" "}
                  {fmtMins(shortest.waitMin ?? 0)} expected wait.
                  ~{shortest.distanceKm} km from your location.
                </p>
                <div className="pick-meta">
                  <span>
                    <Icon name="clock" size={13} /> {shortest.hours}
                  </span>
                  <span>
                    <Icon name="users" size={13} /> {shortest.audience}
                  </span>
                </div>
                <div className="actions" style={{ marginTop: 20 }}>
                  <a
                    className="action-btn primary"
                    href={mapFacilityUrl(shortest, true)}
                    aria-label={`Directions to ${shortest.name}`}
                    title="Directions"
                  >
                    <Icon name="directions" size={14} /> <span className="action-label">Directions</span>
                  </a>
                  <button
                    className="action-btn"
                    type="button"
                    onClick={() => setSelected(shortest)}
                    aria-label={`Full details for ${shortest.name}`}
                    title="Full details"
                  >
                    <Icon name="info" size={14} /> <span className="action-label">Full details</span>
                  </button>
                </div>
              </div>
              <div
                className={"wait " + (!shortest.open ? "is-closed" : "")}
                data-sev={severityFor(shortest.waitMin)}
                data-stale={(now != null && isStaleReading(shortest.observedAtMs, now.getTime())) || undefined}
                aria-label={shortest.open ? undefined : shortest.name + " is closed"}
              >
                {shortest.open ? (
                  <>
                    <div className="wait-num">{shortest.waitText}</div>
                    <div className="wait-label">
                      <span className="sev-dot" />
                      {now != null && isStaleReading(shortest.observedAtMs, now.getTime())
                        ? "Stale reading"
                        : facilityWaitStatusLabel(shortest)}
                    </div>
                    <div className="updated">Updated {shortest.lastUpdated}</div>
                  </>
                ) : (
                  <div className="closed-state">
                    <ClosedIllustration className="closed-illustration closed-hero" />
                    <strong>Closed</strong>
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
            aria-label="Facility filters"
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
                {f.label}
                <span className="count">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <div className="spacer-flex" />
          <div className="sort-control" role="group" aria-label="Sort facilities">
            <span className="sort-label">Sort</span>
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
                  title={s.label}
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
              <small>Sorted by</small>
              <strong>{activeSort.label}</strong>
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
                  <p>Sort facilities</p>
                  <h2 id="sort-sheet-title">Choose list order</h2>
                </div>
                <button type="button" className="sort-sheet-close" aria-label="Close sort options" onClick={() => setSortSheetOpen(false)}>
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
                      <strong>{s.label}</strong>
                      <small>{s.description}</small>
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
          {filtered.slice(0, visibleCount).map((f) => (
            <FacilityCard key={f.id} f={f} onSelect={setSelected} nowMs={now?.getTime() ?? null} />
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
              No facilities match this filter.
              <button className="empty-reset" type="button" onClick={() => setFilter("all")}>
                Show all facilities
              </button>
            </div>
          )}
        </div>

        {/* Advice */}
        <section className="advice-grid">
          <div className="advice-card">
            <div className="a-num">01</div>
            <h3>Not sure where to go?</h3>
            <p>
              Call 8-1-1 to talk with a registered nurse 24/7. They can help you
              decide whether you need the ED, a clinic, or self-care at home.
            </p>
            <a href="tel:811">Call 8-1-1 →</a>
          </div>
          <div className="advice-card">
            <div className="a-num">02</div>
            <h3>How wait time is measured</h3>
            <p>
              Wait time is the duration for 9 out of 10 patients to be seen by a
              physician — not the full visit length. Sicker patients are seen
              first.
            </p>
          </div>
          <div className="advice-card">
            <div className="a-num">03</div>
            <h3>What to bring</h3>
            <p>
              Bring your BC Services Card, a list of medications, and something
              to keep you occupied. Eat and drink lightly unless told otherwise.
            </p>
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
                <span>Live emergency wait times · Lower Mainland, BC</span>
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
                  Service status
                </span>
                <Icon name="external" size={11} />
              </a>
            </div>
          </div>
          <p className="footnote">
            Wait times are estimates only and update every few minutes. If your
            condition worsens while waiting, tell the triage nurse. This site is an
            independent demo and not affiliated with any health authority.
          </p>
        </footer>
      </main>

      {selected && (
        <DetailsDrawer
          f={selected}
          onClose={() => setSelected(null)}
          IconComponent={Icon}
          WaveBackgroundComponent={WaveBackground}
        />
      )}
    </div>
  );
}
