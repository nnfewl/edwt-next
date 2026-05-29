"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faChartLine,
  faCheck,
  faChevronDown,
  faCircleInfo,
  faClock,
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
  severityFor,
} from "./data";
import { ClosedIllustration } from "./closed-illustration";
import { AppTopBar } from "./app-topbar";
import { withOriginDistances } from "./geo-distance";
import { type LocationOrigin } from "./location-types";
import "./styles.css";

/* ───────── icons ─────────────────────────────────────────────────────────── */

type IconName =
  | "pin"
  | "phone"
  | "info"
  | "clock"
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
  | "external";

const ICONS: Record<IconName, IconDefinition> = {
  pin: faLocationDot,
  phone: faPhone,
  info: faCircleInfo,
  clock: faClock,
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
  const sev = severityFor(f.waitMin);
  const sevLabel = facilityWaitStatusLabel(f);
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
            <span className="m address-line">{f.address}</span>
            <span className="distance-note" aria-label={`${f.distanceKm} km away`}>
              <Icon name="pin" size={12} />
              {f.distanceKm} km
            </span>
          </span>
          {f.open && (
            <>
              {f.inWaitingRoom > 0 && (
                <span className="m">
                  <Icon name="users" size={14} />
                  {f.inWaitingRoom} waiting
                </span>
              )}
              {f.physiciansOnDuty > 0 && (
                <span className="m">
                  <Icon name="stethoscope" size={14} />
                  {f.physiciansOnDuty} on duty
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

/* ───────── details drawer ────────────────────────────────────────────────── */

const DetailsDrawer = ({
  f,
  onClose,
}: {
  f: Facility | null;
  onClose: () => void;
}) => {
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

  if (!f) return null;
  const sev = severityFor(f.waitMin);
  const hasWaitData = f.waitMin != null;
  const stopBubble = (e: React.MouseEvent) => e.stopPropagation();
  const waitInline: CSSProperties = {
    alignItems: "flex-start",
    textAlign: "left",
    margin: "14px 0 22px",
    paddingBottom: 22,
    borderBottom: "1px solid var(--line)",
  };
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside
        className="drawer-panel"
        onClick={stopBubble}
        role="dialog"
        aria-modal="true"
        aria-labelledby="facility-details-title"
      >
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

        <div style={{ display: "flex", gap: 8 }}>
          <a
            className="action-btn primary"
            href={mapFacilityUrl(f, true)}
            style={{ flex: 1, justifyContent: "center" }}
            aria-label={`Directions to ${f.name}`}
            title="Directions"
          >
            <Icon name="directions" size={14} /> <span className="action-label">Directions</span>
          </a>
          {f.phone && (
            <a
              className="action-btn"
              href={`tel:${f.phone}`}
              style={{ flex: 1, justifyContent: "center" }}
              aria-label={`Call ${f.name} at ${f.phone}`}
              title={`Call ${f.phone}`}
            >
              <Icon name="phone" size={14} /> <span className="action-label">Call {f.phone}</span>
            </a>
          )}
        </div>
      </aside>
    </div>
  );
};

/* ───────── page ──────────────────────────────────────────────────────────── */

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
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("wait");
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [selected, setSelected] = useState<Facility | null>(null);
  // Store ONLY a GPS override locally; fall back to the prop so server-side IP
  // geolocation updates flow in on refresh without resetting a user's GPS choice.
  const [gpsOrigin, setGpsOrigin] = useState<LocationOrigin | null>(null);
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

  const activeSort = SORTS.find((s) => s.id === sort) ?? SORTS[0];
  const locationModeLabel = origin.source === "gps" ? "Precise location" : "Approximate location";
  const locationText = origin.source === "gps" ? "Browser GPS location" : origin.label;
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
      (position) => {
        setGpsOrigin({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Precise location",
          source: "gps",
          accuracyLabel: "browser GPS",
        });
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
      <AppTopBar active="list" />
      <main className="page">
        {/* Hero */}
        <section className="hero">
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
            {now && (
              <div style={{ display: "flex", gap: 8 }}>
                <span>
                  {now.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                <span>·</span>
                <span>
                  {now.toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
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
            <div>
              <span className="pick-eyebrow">
                <Icon name="star" size={11} stroke={2} />
                Recommended for you
              </span>
              <h2 className="pick-name">
                {shortest.name}
                <span className="pick-sub">{shortest.subtitle}</span>
              </h2>
              <p className="pick-reason">
                Shortest reported wait among open facilities — about a{" "}
                {fmtMins(shortest.waitMin ?? 0)} expected wait
                {shortest.inWaitingRoom > 0 && (
                  <> with <b>{shortest.inWaitingRoom} people</b> in the waiting room</>
                )}
                . ~{shortest.distanceKm} km from your location.
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
                    <Icon name="stethoscope" size={13} /> {shortest.physiciansOnDuty}{" "}
                    clinicians on duty
                  </span>
                )}
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
            <div className={"wait " + (!shortest.open ? "is-closed" : "")} data-sev={severityFor(shortest.waitMin)} aria-label={shortest.open ? undefined : shortest.name + " is closed"}>
              {shortest.open ? (
                <>
                  <div className="wait-num">{shortest.waitText}</div>
                  <div className="wait-label">
                    <span className="sev-dot" />
                    {facilityWaitStatusLabel(shortest)}
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
        )}

        {/* Filter toolbar */}
        <div className="toolbar">
          <div className="chip-row" role="group" aria-label="Facility filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`chip ${filter === f.id ? "active" : ""}`}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                <span className="count">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <div className="spacer-flex" />
          <div className="sort-control" role="group" aria-label="Sort facilities">
            <span className="sort-label">Sort</span>
            <div className="sort-options">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  className={`sort-option ${sort === s.id ? "active" : ""}`}
                  type="button"
                  aria-pressed={sort === s.id}
                  aria-label={s.label}
                  title={s.label}
                  onClick={() => setSort(s.id)}
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
                <span className="footer-link-label">
                  Data from <strong>edwaittimes.ca</strong>
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

      <DetailsDrawer f={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
