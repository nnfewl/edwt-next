"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrosshairs, faLocationArrow, faPhone } from "@fortawesome/free-solid-svg-icons";
import maplibregl, { type GeoJSONSource, type LngLatLike, type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type Facility, facilityWaitStatusLabel, severityFor } from "../data";
import { ClosedIllustration } from "../closed-illustration";
import { withOriginDistances } from "../geo-distance";
import { preciseGpsOriginWithLocationText, useSessionGpsOrigin, writeSessionGpsOrigin } from "../location-session";
import { type LocationOrigin } from "../location-types";
import "./styles.css";

const VANCOUVER_CENTER: LngLatLike = [-122.84, 49.18];
// Keep the camera over southwestern BC (where every facility sits) so users
// can't pan/zoom out to the rest of the world. [[west, south], [east, north]].
const REGION_BOUNDS: [[number, number], [number, number]] = [[-125.8, 48.4], [-119.6, 51.3]];
const ROUTE_SOURCE_ID = "selected-route";
const ROUTE_LAYER_ID = "selected-route-line";
const FACILITY_SOURCE_ID = "facility-markers";
const FACILITY_HALO_LAYER_ID = "facility-marker-halo";
const FACILITY_ICON_LAYER_ID = "facility-marker-icon";
const FACILITY_DETAIL_ICON_LAYER_ID = "facility-marker-detail-icon";
const FACILITY_SELECTED_ICON_LAYER_ID = "facility-marker-selected-icon";
const FACILITY_LABEL_LAYER_ID = "facility-marker-label";
const MARKER_IMAGE_SIZE = 48;
const MARKER_IMAGE_PIXEL_RATIO = 2;

type RouteState = {
  distanceKm: number;
  durationMin: number;
  originLabel: string;
} | null;

// CARTO Positron keeps the clinical map quieter than Voyager.
// NOTE: `router.project-osrm.org` is OSRM's public demo and is NOT suitable for
// production traffic; replace with a self-hosted OSRM, Maptiler, or Mapbox
// directions endpoint before any real launch.
const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    cartoPositron: {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '© <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    },
  },
  layers: [
    {
      id: "carto-positron",
      type: "raster",
      source: "cartoPositron",
    },
  ],
};

function waitText(value: number | null) {
  if (value == null) return "No data";
  if (value >= 60) return Math.floor(value / 60) + "h " + Math.round(value % 60) + "m";
  return Math.round(value) + "m";
}

function pressureRank(facilities: Facility[], selectedId: string | null) {
  return facilities
    .filter((facility) => facility.waitMin !== null)
    .sort((a, b) => (b.waitMin ?? 0) - (a.waitMin ?? 0))
    .slice(0, 4)
    .some((facility) => facility.id === selectedId);
}

const HEALTH_AUTHORITIES = {
  bcchildrens: { name: "BC Children's Hospital", faviconPath: "/health-authorities/bcchildrens.png" },
  bcwomens: { name: "BC Women's Hospital", faviconPath: "/health-authorities/bcwomens.ico" },
  fraserhealth: { name: "Fraser Health", faviconPath: "/health-authorities/fraserhealth.ico" },
  providencehealthcare: { name: "Providence Health Care", faviconPath: "/health-authorities/providencehealthcare.ico" },
  vch: { name: "Vancouver Coastal Health", faviconPath: "/health-authorities/vch.png" },
} as const;

type HealthAuthorityKey = keyof typeof HEALTH_AUTHORITIES;
type Severity = ReturnType<typeof severityFor>;
type HealthAuthority = { key: HealthAuthorityKey; name: string; faviconPath: string };

const SEVERITIES: Severity[] = ["short", "medium", "long", "closed"];
const SEVERITY_COLORS: Record<Severity, string> = {
  short: "#16a34a",
  medium: "#d97706",
  long: "#dc2626",
  closed: "#64748b",
};
const SEVERITY_PLACEMENT_RANK: Record<Severity, number> = {
  long: 0,
  medium: 1000,
  short: 2000,
  closed: 3000,
};

const VCH_PLACES = ["vancouver", "north vancouver", "west vancouver", "richmond", "sechelt", "gibsons", "squamish", "whistler", "pemberton", "powell river"];

function authority(key: HealthAuthorityKey): HealthAuthority {
  return { key, ...HEALTH_AUTHORITIES[key] };
}

function markerImageId(key: HealthAuthorityKey, severity: Severity) {
  return "facility-marker-" + key + "-" + severity;
}

// BC ER/UPCC facilities operate under a regional health authority rather than
// their own site, so the marker badge shows the operating authority's favicon.
// Classify by name override first (Children's / Providence sites), then by the
// city found in the address; Fraser Health is the largest-by-count fallback.
function healthAuthorityFor(facility: Facility): HealthAuthority {
  const name = facility.name.toLowerCase();
  if (name.includes("children")) return authority("bcchildrens");
  if (name.includes("women")) return authority("bcwomens");
  if (name.includes("st. paul") || name.includes("st paul") || name.includes("saint paul") ||
    name.includes("mount saint joseph") || name.includes("mount st. joseph") || name.includes("mount st joseph")) {
    return authority("providencehealthcare");
  }
  const haystack = (facility.address + " " + facility.name).toLowerCase();
  if (VCH_PLACES.some((place) => haystack.includes(place))) {
    return authority("vch");
  }
  return authority("fraserhealth");
}

function placementRankFor(facility: Facility, severity: Severity) {
  return SEVERITY_PLACEMENT_RANK[severity] + Math.min(facility.distanceKm, 999);
}

function initialsFor(name: string) {
  return name
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function loadMarkerIcon(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function createMarkerImage(authorityInfo: HealthAuthority, severity: Severity) {
  const canvas = document.createElement("canvas");
  const pixelSize = MARKER_IMAGE_SIZE * MARKER_IMAGE_PIXEL_RATIO;
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");

  ctx.scale(MARKER_IMAGE_PIXEL_RATIO, MARKER_IMAGE_PIXEL_RATIO);
  const center = MARKER_IMAGE_SIZE / 2;
  const radius = 18;

  ctx.shadowColor = "rgba(15, 23, 42, 0.35)";
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.lineWidth = 4;
  ctx.strokeStyle = SEVERITY_COLORS[severity];
  ctx.stroke();

  const image = await loadMarkerIcon(authorityInfo.faviconPath);
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, 12, 0, Math.PI * 2);
  ctx.clip();
  if (image) {
    ctx.drawImage(image, center - 11, center - 11, 22, 22);
  } else {
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(center - 12, center - 12, 24, 24);
    ctx.fillStyle = "#17201d";
    ctx.font = "700 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsFor(authorityInfo.name), center, center + 0.5);
  }
  ctx.restore();

  return ctx.getImageData(0, 0, pixelSize, pixelSize);
}

async function addFacilityMarkerImages(m: MapLibreMap) {
  await Promise.all(
    (Object.keys(HEALTH_AUTHORITIES) as HealthAuthorityKey[]).flatMap((key) =>
      SEVERITIES.map(async (severity) => {
        const id = markerImageId(key, severity);
        if (m.hasImage(id)) return;
        const image = await createMarkerImage(authority(key), severity);
        if (!m.hasImage(id)) {
          m.addImage(id, image, { pixelRatio: MARKER_IMAGE_PIXEL_RATIO });
        }
      }),
    ),
  );
}

type FacilityMarkerProperties = {
  id: string;
  name: string;
  waitText: string;
  severity: ReturnType<typeof severityFor>;
  authority: string;
  icon: string;
  placementRank: number;
  iconOffset: [number, number];
  textOffset: [number, number];
};

type FacilityMarkerData = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: FacilityMarkerProperties;
  }>;
};

function duplicateOffset(index: number, count: number): [number, number] {
  if (count <= 1) return [0, 0];
  if (count === 2) return index === 0 ? [-16, 0] : [16, 0];
  const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / count);
  const radius = count === 3 ? 18 : 22;
  return [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)];
}

function facilityMarkerData(facilities: Facility[]): FacilityMarkerData {
  const groups = new Map<string, Facility[]>();
  facilities.forEach((facility) => {
    const key = facility.lng.toFixed(4) + ":" + facility.lat.toFixed(4);
    groups.set(key, [...(groups.get(key) ?? []), facility]);
  });

  return {
    type: "FeatureCollection",
    features: facilities.map((facility) => {
      const authority = healthAuthorityFor(facility);
      const severity = severityFor(facility.waitMin);
      const groupKey = facility.lng.toFixed(4) + ":" + facility.lat.toFixed(4);
      const group = groups.get(groupKey) ?? [facility];
      const offset = duplicateOffset(group.findIndex((item) => item.id === facility.id), group.length);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [facility.lng, facility.lat] },
        properties: {
          id: facility.id,
          name: facility.name,
          waitText: facility.waitText,
          severity,
          authority: authority.name,
          icon: markerImageId(authority.key, severity),
          placementRank: placementRankFor(facility, severity),
          iconOffset: offset,
          textOffset: [offset[0] / 12, 1.55 + offset[1] / 18],
        },
      };
    }),
  };
}

function selectedMarkerFilter(selectedId: string | null): maplibregl.FilterSpecification {
  return ["==", ["get", "id"], selectedId ?? "__none__"];
}

function setSelectedMarkerFilter(m: MapLibreMap, selectedId: string | null) {
  const filter = selectedMarkerFilter(selectedId);
  if (m.getLayer(FACILITY_HALO_LAYER_ID)) m.setFilter(FACILITY_HALO_LAYER_ID, filter);
  if (m.getLayer(FACILITY_SELECTED_ICON_LAYER_ID)) m.setFilter(FACILITY_SELECTED_ICON_LAYER_ID, filter);
}

function addFacilityLayers(m: MapLibreMap, data: FacilityMarkerData, selectedId: string | null) {
  if (m.getSource(FACILITY_SOURCE_ID)) return;

  m.addSource(FACILITY_SOURCE_ID, { type: "geojson", data: data as never });
  m.addLayer({
    id: FACILITY_HALO_LAYER_ID,
    type: "circle",
    source: FACILITY_SOURCE_ID,
    filter: selectedMarkerFilter(selectedId),
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 17, 10, 20, 13, 23],
      "circle-color": "rgba(15, 118, 110, 0.20)",
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255, 255, 255, 0.86)",
    },
  });
  m.addLayer({
    id: FACILITY_ICON_LAYER_ID,
    type: "symbol",
    source: FACILITY_SOURCE_ID,
    maxzoom: 10.75,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 7, 0.62, 10, 0.78],
      "icon-allow-overlap": false,
      "icon-ignore-placement": false,
      "icon-padding": 10,
      "symbol-sort-key": ["get", "placementRank"],
    },
  });
  m.addLayer({
    id: FACILITY_DETAIL_ICON_LAYER_ID,
    type: "symbol",
    source: FACILITY_SOURCE_ID,
    minzoom: 10.75,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10.75, 0.86, 13, 1],
      "icon-offset": ["get", "iconOffset"],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  m.addLayer({
    id: FACILITY_SELECTED_ICON_LAYER_ID,
    type: "symbol",
    source: FACILITY_SOURCE_ID,
    filter: selectedMarkerFilter(selectedId),
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 7, 0.78, 10, 0.94, 13, 1.05],
      "icon-offset": ["get", "iconOffset"],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  m.addLayer({
    id: FACILITY_LABEL_LAYER_ID,
    type: "symbol",
    source: FACILITY_SOURCE_ID,
    minzoom: 11.1,
    layout: {
      "text-field": ["get", "waitText"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 11.1, 10, 13, 12],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-anchor": "top",
      "text-offset": ["get", "textOffset"],
      "text-allow-overlap": false,
      "text-ignore-placement": false,
      "text-padding": 4,
      "symbol-sort-key": ["get", "placementRank"],
    },
    paint: {
      "text-color": "#17201d",
      "text-halo-color": "rgba(255, 255, 255, 0.95)",
      "text-halo-width": 2,
    },
  });
}

type BrowserPosition = { lngLat: [number, number]; accuracy: number | null };

function getBrowserPosition(): Promise<BrowserPosition | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lngLat: [position.coords.longitude, position.coords.latitude],
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 6_000 },
    );
  });
}

function createFontAwesomeSvg(icon: typeof faLocationArrow) {
  const [width, height, , , pathData] = icon.icon;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("map-location-control-icon");

  const paths = Array.isArray(pathData) ? pathData : [pathData];
  paths.forEach((pathValue) => {
    const pathNode = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathNode.setAttribute("fill", "currentColor");
    pathNode.setAttribute("d", pathValue);
    svg.append(pathNode);
  });

  return svg;
}

export function MapClient({
  facilities,
  initialOrigin,
  initialFacilityId,
  routeRequested,
}: {
  facilities: Facility[];
  initialOrigin: LocationOrigin;
  initialFacilityId: string | null;
  routeRequested: boolean;
}) {
  // GPS override pattern: store only the user-granted location locally so the
  // server's IP-geolocated `initialOrigin` can update through router.refresh()
  // without clobbering a user's precise-location choice.
  const [gpsOrigin, setGpsOrigin] = useSessionGpsOrigin();
  const origin: LocationOrigin = gpsOrigin ?? initialOrigin;
  const facilitiesWithDistance = useMemo(
    () => withOriginDistances(facilities, origin),
    [facilities, origin],
  );
  const openFacilities = facilitiesWithDistance.filter((facility) => facility.open);
  const openWaitFacilities = openFacilities.filter((facility) => facility.waitMin != null);
  const shortest = [...openWaitFacilities].sort(
    (a, b) => (a.waitMin ?? Infinity) - (b.waitMin ?? Infinity),
  )[0];
  const longest = [...openWaitFacilities].sort(
    (a, b) => (b.waitMin ?? 0) - (a.waitMin ?? 0),
  )[0];

  const mapNode = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const userLocationMarker = useRef<maplibregl.Marker | null>(null);
  const locationControlButton = useRef<HTMLButtonElement | null>(null);
  const showUserLocationRef = useRef<() => void>(() => {});
  const autoRouteDone = useRef(false);
  const [selectedId, setSelectedId] = useState(initialFacilityId ?? shortest?.id ?? facilitiesWithDistance[0]?.id ?? null);
  const selected = facilitiesWithDistance.find((facility) => facility.id === selectedId) ?? facilitiesWithDistance[0];
  const selectedHasWaitData = selected?.waitMin != null;
  const selectedInTopPressure = pressureRank(facilitiesWithDistance, selectedId);
  const [route, setRoute] = useState<RouteState>(null);
  const [mapReady, setMapReady] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  // Capture the initial facility list in a ref so the mount-only init effect
  // can read it for fitBounds without taking a dep that would tear the whole
  // map down (and reset pan/zoom + any active route) every time router.refresh
  // hands a new array reference down. `useRef(initial)` ignores subsequent
  // renders, so this snapshot stays at the first-render value — exactly what
  // fitBounds wants. The reconciliation effect below picks up later changes.
  const initialFacilitiesRef = useRef(facilities);
  const initialSelectedIdRef = useRef(selectedId);

  useEffect(() => {
    if (!mapNode.current || map.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapNode.current,
        style: mapStyle,
        center: VANCOUVER_CENTER,
        zoom: 10.2,
        minZoom: 7,
        maxZoom: 16,
        maxBounds: REGION_BOUNDS,
        attributionControl: false,
      });
    } catch {
      const fallbackTimer = window.setTimeout(() => {
        setMapUnavailable("Map rendering is unavailable in this browser. Facility details are still available below.");
      }, 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    const m = map.current;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const locationControl: maplibregl.IControl = {
      onAdd() {
        const container = document.createElement("div");
        container.className = "maplibregl-ctrl maplibregl-ctrl-group map-location-control-group";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "map-location-control";
        button.title = "Show your location";
        button.setAttribute("aria-label", "Show your location");
        button.append(createFontAwesomeSvg(faLocationArrow));
        button.addEventListener("click", () => showUserLocationRef.current());
        container.append(button);
        locationControlButton.current = button;
        return container;
      },
      onRemove() {
        locationControlButton.current = null;
      },
    };
    m.addControl(locationControl, "top-right");

    const bounds = new maplibregl.LngLatBounds();
    initialFacilitiesRef.current.forEach((facility) => bounds.extend([facility.lng, facility.lat]));
    if (!bounds.isEmpty()) {
      m.fitBounds(bounds, { padding: 78, maxZoom: 11.8, duration: 0 });
    }

    const interactiveMarkerLayers = [FACILITY_SELECTED_ICON_LAYER_ID, FACILITY_DETAIL_ICON_LAYER_ID, FACILITY_ICON_LAYER_ID] as const;
    const handleMarkerClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") setSelectedId(id);
    };
    const handleMarkerEnter = () => { m.getCanvas().style.cursor = "pointer"; };
    const handleMarkerLeave = () => { m.getCanvas().style.cursor = ""; };
    let markerEventsBound = false;
    let disposed = false;

    const onLoad = () => {
      void (async () => {
        await addFacilityMarkerImages(m);
        if (disposed) return;
        addFacilityLayers(m, facilityMarkerData(initialFacilitiesRef.current), initialSelectedIdRef.current);
        interactiveMarkerLayers.forEach((layerId) => {
          m.on("click", layerId, handleMarkerClick);
          m.on("mouseenter", layerId, handleMarkerEnter);
          m.on("mouseleave", layerId, handleMarkerLeave);
        });
        markerEventsBound = true;
        setMapReady(true);
      })();
    };

    if (m.loaded()) onLoad();
    else m.once("load", onLoad);

    return () => {
      disposed = true;
      if (markerEventsBound) {
        interactiveMarkerLayers.forEach((layerId) => {
          m.off("click", layerId, handleMarkerClick);
          m.off("mouseenter", layerId, handleMarkerEnter);
          m.off("mouseleave", layerId, handleMarkerLeave);
        });
      }
      userLocationMarker.current?.remove();
      userLocationMarker.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const source = map.current?.getSource(FACILITY_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(facilityMarkerData(facilitiesWithDistance) as never);
  }, [facilitiesWithDistance, mapReady]);

  useEffect(() => {
    if (!map.current || !mapReady) return;
    setSelectedMarkerFilter(map.current, selectedId);
  }, [selectedId, mapReady]);

  const clearRoute = useCallback(() => {
    if (map.current?.getLayer(ROUTE_LAYER_ID)) map.current.removeLayer(ROUTE_LAYER_ID);
    if (map.current?.getSource(ROUTE_SOURCE_ID)) map.current.removeSource(ROUTE_SOURCE_ID);
    setRoute(null);
    setRouteError(null);
  }, []);

  const applyGpsOrigin = useCallback((nextOrigin: LocationOrigin) => {
    setGpsOrigin(nextOrigin);
    writeSessionGpsOrigin(nextOrigin);
  }, []);

  const setUserLocationMarker = useCallback((browserOrigin: [number, number]) => {
    if (!map.current) return;

    if (!userLocationMarker.current) {
      const markerNode = document.createElement("div");
      markerNode.className = "user-location-marker";
      markerNode.setAttribute("aria-label", "Your location");
      const pinNode = document.createElement("span");
      pinNode.className = "user-location-pin";
      markerNode.append(pinNode);
      userLocationMarker.current = new maplibregl.Marker({ element: markerNode, anchor: "bottom" })
        .setLngLat(browserOrigin)
        .addTo(map.current);
    } else {
      userLocationMarker.current.setLngLat(browserOrigin);
    }
  }, []);

  const showUserLocation = useCallback(async () => {
    if (!map.current) return;

    setLocating(true);
    setRouteError(null);
    const pos = await getBrowserPosition();
    setLocating(false);

    if (!pos) {
      setRouteError("Precise location is required to show your location on the map.");
      return;
    }

    applyGpsOrigin(await preciseGpsOriginWithLocationText(pos.lngLat[1], pos.lngLat[0], pos.accuracy));
    setUserLocationMarker(pos.lngLat);

    map.current.easeTo({ center: pos.lngLat, zoom: Math.max(map.current.getZoom(), 12.8), duration: 700 });
  }, [applyGpsOrigin, setUserLocationMarker]);

  useEffect(() => {
    showUserLocationRef.current = showUserLocation;
  }, [showUserLocation]);

  useEffect(() => {
    const button = locationControlButton.current;
    if (!button) return;
    button.disabled = !mapReady || locating;
    button.title = locating ? "Finding your location" : "Show your location";
    button.setAttribute("aria-label", locating ? "Finding your location" : "Show your location");
    button.classList.toggle("is-locating", locating);
  }, [locating, mapReady]);

  useEffect(() => {
    if (!mapReady || !gpsOrigin || gpsOrigin.source !== "gps") return;
    setUserLocationMarker([gpsOrigin.lng, gpsOrigin.lat]);
  }, [gpsOrigin, mapReady, setUserLocationMarker]);

  const showDirections = useCallback(async () => {
    if (!map.current || !selected) return;

    setRouteLoading(true);
    clearRoute();

    const pos = await getBrowserPosition();
    if (!pos) {
      setRouteError("Precise location is required to show directions.");
      setRouteLoading(false);
      return;
    }

    applyGpsOrigin(await preciseGpsOriginWithLocationText(pos.lngLat[1], pos.lngLat[0], pos.accuracy));
    setUserLocationMarker(pos.lngLat);

    const url = "https://router.project-osrm.org/route/v1/driving/" +
      pos.lngLat[0] + "," + pos.lngLat[1] + ";" + selected.lng + "," + selected.lat +
      "?overview=full&geometries=geojson&steps=false";

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Routing service unavailable");
      const payload = await response.json() as {
        routes?: Array<{
          distance: number;
          duration: number;
          geometry: GeoJSON.LineString;
        }>;
      };
      const nextRoute = payload.routes?.[0];
      if (!nextRoute) throw new Error("No route found");

      if (map.current.getLayer(ROUTE_LAYER_ID)) map.current.removeLayer(ROUTE_LAYER_ID);
      if (map.current.getSource(ROUTE_SOURCE_ID)) map.current.removeSource(ROUTE_SOURCE_ID);

      map.current.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: nextRoute.geometry,
        },
      });
      map.current.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#0f766e",
          "line-width": 6,
          "line-opacity": 0.88,
        },
      });

      const bounds = new maplibregl.LngLatBounds();
      nextRoute.geometry.coordinates.forEach((coord) => bounds.extend(coord as [number, number]));
      map.current.fitBounds(bounds, { padding: 88, maxZoom: 13.5, duration: 700 });
      setRoute({
        distanceKm: nextRoute.distance / 1000,
        durationMin: nextRoute.duration / 60,
        originLabel: "precise location",
      });
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : "Could not calculate directions");
    } finally {
      setRouteLoading(false);
    }
  }, [applyGpsOrigin, clearRoute, selected, setUserLocationMarker]);

  useEffect(() => {
    const timer = window.setTimeout(clearRoute, 0);
    return () => window.clearTimeout(timer);
  }, [clearRoute, selectedId]);

  useEffect(() => {
    if (!routeRequested || autoRouteDone.current || !mapReady || !selected) return;
    autoRouteDone.current = true;
    void showDirections();
  }, [mapReady, routeRequested, selected, showDirections]);

  return (
    <main className="map-page">
      <section className="map-shell">
        <aside className="map-sidebar" aria-label="Facility map controls">
          <div className="map-copy">
            <p className="eyebrow">{facilitiesWithDistance.length} reporting</p>
            <h1>Nearby facilities</h1>
            <p>
              Wait-time markers are colored by severity. Pick a facility to inspect the current wait, distance, and directions.
            </p>
          </div>

          <div className="map-stats">
            <div>
              <span>Shortest open wait</span>
              <strong>{shortest ? waitText(shortest.waitMin) : "No data"}</strong>
              <small>{shortest?.name ?? (openFacilities.length ? "No posted waits" : "No open facilities")}</small>
            </div>
            <div>
              <span>Highest pressure</span>
              <strong>{longest ? waitText(longest.waitMin) : "No data"}</strong>
              <small>{longest?.name ?? (openFacilities.length ? "No posted waits" : "No open facilities")}</small>
            </div>
          </div>

          {selected && (
            <article className="selected-card" data-severity={severityFor(selected.waitMin)}>
              <div className="selected-head">
                <span className="type-pill">{selected.type}</span>
                {selected.open && <span className="status-pill open">Open</span>}
              </div>
              <h2>{selected.name}</h2>
              <p>{selected.subtitle} · {selected.audience}</p>
              <div
                className={"selected-wait " + (!selected.open ? "is-closed" : !selectedHasWaitData ? "is-no-data" : "")}
                aria-label={!selected.open ? selected.name + " is closed" : !selectedHasWaitData ? selected.name + " has no posted wait data" : undefined}
              >
                {selected.open ? (
                  selectedHasWaitData ? (
                    <>
                      <strong>{selected.waitText}</strong>
                      <span className="selected-wait-status">
                        {facilityWaitStatusLabel(selected)} · updated {selected.lastUpdated}
                      </span>
                    </>
                  ) : (
                    <div className="no-data-state no-data-map-state">
                      <strong>No data</strong>
                      <span>No wait posted</span>
                    </div>
                  )
                ) : (
                  <div className="closed-state closed-map-state">
                    <ClosedIllustration className="closed-illustration closed-map" />
                    <strong>Closed</strong>
                  </div>
                )}
              </div>
              <dl>
                <div><dt>Distance</dt><dd>{selected.distanceKm} km</dd></div>
                {selected.inWaitingRoom > 0 && <div><dt>Waiting</dt><dd>{selected.inWaitingRoom}</dd></div>}
                {selected.physiciansOnDuty > 0 && <div><dt>On duty</dt><dd>{selected.physiciansOnDuty}</dd></div>}
              </dl>
              {selectedInTopPressure && (
                <div className="pressure-note">This site is currently in the top pressure group.</div>
              )}
              <div className="selected-actions">
                <button type="button" onClick={showDirections} disabled={routeLoading}>
                  <FontAwesomeIcon icon={faLocationArrow} aria-hidden="true" />
                  <span>{routeLoading ? "Routing..." : "Directions"}</span>
                </button>
                <button type="button" onClick={() => map.current?.easeTo({ center: [selected.lng, selected.lat], zoom: 13.2, duration: 650 })}>
                  <FontAwesomeIcon icon={faCrosshairs} aria-hidden="true" />
                  <span>Center map</span>
                </button>
                {selected.phone && (
                  <a href={"tel:" + selected.phone}>
                    <FontAwesomeIcon icon={faPhone} aria-hidden="true" />
                    <span>Call</span>
                  </a>
                )}
              </div>
              {route && (
                <div className="route-note">
                  Route from {route.originLabel}: {route.distanceKm.toFixed(1)} km · {Math.round(route.durationMin)} min drive
                </div>
              )}
              {routeError && <div className="route-note error">{routeError}</div>}
            </article>
          )}

          <div className="facility-scroll">
            {facilitiesWithDistance.map((facility) => (
              <button
                key={facility.id}
                type="button"
                className={"facility-row " + (facility.id === selectedId ? "active" : "")}
                data-severity={severityFor(facility.waitMin)}
                onClick={() => setSelectedId(facility.id)}
              >
                <span className="row-dot" />
                <span className="row-main">
                  <strong>{facility.name}</strong>
                  <small>{facility.subtitle}</small>
                </span>
                <span className="row-wait">{facility.waitText}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="map-canvas-wrap">
          <div ref={mapNode} className="map-canvas" />
          {mapUnavailable && (
            <div className="map-fallback" role="status">
              <strong>Map unavailable</strong>
              <span>{mapUnavailable}</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
