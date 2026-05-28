"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faChartLine, faHospital, faList, faMapLocationDot } from "@fortawesome/free-solid-svg-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type LngLatLike, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type Facility, severityFor, severityLabel } from "../data";
import "./styles.css";

const VANCOUVER_CENTER: LngLatLike = [-122.84, 49.18];
const FALLBACK_ORIGIN: [number, number] = [-122.84, 49.14];
const ROUTE_SOURCE_ID = "selected-route";
const ROUTE_LAYER_ID = "selected-route-line";

type RouteState = {
  distanceKm: number;
  durationMin: number;
  originLabel: string;
} | null;

const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    cartoVoyager: {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: "carto-voyager",
      type: "raster",
      source: "cartoVoyager",
    },
  ],
};

function waitText(value: number | null) {
  if (value == null) return "Closed";
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

function getBrowserPosition(): Promise<[number, number] | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.longitude, position.coords.latitude]),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 6_000 },
    );
  });
}

export function MapClient({
  facilities,
  initialFacilityId,
  routeRequested,
}: {
  facilities: Facility[];
  initialFacilityId: string | null;
  routeRequested: boolean;
}) {
  const openFacilities = facilities.filter((facility) => facility.open);
  const shortest = [...openFacilities].sort(
    (a, b) => (a.waitMin ?? Infinity) - (b.waitMin ?? Infinity),
  )[0];
  const longest = [...openFacilities].sort(
    (a, b) => (b.waitMin ?? 0) - (a.waitMin ?? 0),
  )[0];

  const mapNode = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const autoRouteDone = useRef(false);
  const [selectedId, setSelectedId] = useState(initialFacilityId ?? shortest?.id ?? facilities[0]?.id ?? null);
  const selected = facilities.find((facility) => facility.id === selectedId) ?? facilities[0];
  const selectedInTopPressure = pressureRank(facilities, selectedId);
  const [route, setRoute] = useState<RouteState>(null);
  const [mapReady, setMapReady] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapNode.current || map.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapNode.current,
        style: mapStyle,
        center: VANCOUVER_CENTER,
        zoom: 10.2,
        attributionControl: false,
      });
    } catch {
      const fallbackTimer = window.setTimeout(() => {
        setMapUnavailable("Map rendering is unavailable in this browser. Facility details are still available below.");
      }, 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    map.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    const markerStore = markers.current;

    const bounds = new maplibregl.LngLatBounds();
    facilities.forEach((facility) => bounds.extend([facility.lng, facility.lat]));
    map.current.fitBounds(bounds, { padding: 78, maxZoom: 11.8, duration: 0 });
    const readyTimer = window.setTimeout(() => setMapReady(true), 0);

    return () => {
      window.clearTimeout(readyTimer);
      markerStore.forEach((marker) => marker.remove());
      markerStore.clear();
      map.current?.remove();
      map.current = null;
    };
  }, [facilities]);

  useEffect(() => {
    if (!map.current) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current.clear();

    facilities.forEach((facility) => {
      const severity = severityFor(facility.waitMin);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-marker " + (selectedId === facility.id ? "selected" : "");
      el.dataset.severity = severity;
      el.setAttribute("aria-label", facility.name + ", " + facility.waitText);
      el.innerHTML = "<span>" + (facility.waitMin == null ? "-" : Math.round(facility.waitMin)) + "</span>";
      el.addEventListener("click", () => setSelectedId(facility.id));

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([facility.lng, facility.lat])
        .addTo(map.current!);
      markers.current.set(facility.id, marker);
    });
  }, [facilities, selectedId]);

  useEffect(() => {
    if (!map.current || !selected) return;
    map.current.easeTo({ center: [selected.lng, selected.lat], zoom: 12.2, duration: 650 });
  }, [selected]);

  const clearRoute = useCallback(() => {
    if (!map.current) return;
    if (map.current.getLayer(ROUTE_LAYER_ID)) map.current.removeLayer(ROUTE_LAYER_ID);
    if (map.current.getSource(ROUTE_SOURCE_ID)) map.current.removeSource(ROUTE_SOURCE_ID);
    setRoute(null);
    setRouteError(null);
  }, []);

  const showDirections = useCallback(async () => {
    if (!map.current || !selected) return;

    setRouteLoading(true);
    setRouteError(null);

    const browserOrigin = await getBrowserPosition();
    const origin = browserOrigin ?? FALLBACK_ORIGIN;
    const url = "https://router.project-osrm.org/route/v1/driving/" +
      origin[0] + "," + origin[1] + ";" + selected.lng + "," + selected.lat +
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
        originLabel: browserOrigin ? "your location" : "Surrey fallback start",
      });
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : "Could not calculate directions");
    } finally {
      setRouteLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    clearRoute();
  }, [clearRoute, selectedId]);

  useEffect(() => {
    if (!routeRequested || autoRouteDone.current || !mapReady || !selected) return;
    autoRouteDone.current = true;
    void showDirections();
  }, [mapReady, routeRequested, selected, showDirections]);

  return (
    <main className="map-page">
      <header className="map-topbar">
        <Link href="/" className="map-wordmark">
          <span className="mark" aria-hidden="true"><FontAwesomeIcon icon={faHospital} /></span>
          <span>
            EDWT
            <small>Lower Mainland · BC</small>
          </span>
        </Link>
        <nav className="map-tabs" aria-label="Primary">
          <Link href="/">Facilities</Link>
          <Link href="/map" className="active">Map</Link>
          <Link href="/admin">Analytics</Link>
        </nav>
        <details className="map-mobile-menu">
          <summary aria-label="Open page menu">
            <FontAwesomeIcon icon={faBars} aria-hidden="true" />
          </summary>
          <div className="map-mobile-menu-panel">
            <Link href="/"><FontAwesomeIcon icon={faList} /> Facilities</Link>
            <Link href="/map" className="active"><FontAwesomeIcon icon={faMapLocationDot} /> Map</Link>
            <Link href="/admin"><FontAwesomeIcon icon={faChartLine} /> Analytics</Link>
          </div>
        </details>
        <div className="map-live"><span /> Live waits</div>
      </header>

      <section className="map-shell">
        <aside className="map-sidebar" aria-label="Facility map controls">
          <div className="map-copy">
            <p className="eyebrow">MapLibre GL</p>
            <h1>Facility pressure map</h1>
            <p>
              Wait-time markers are colored by severity. Pick a facility to inspect the current wait, distance, and directions.
            </p>
          </div>

          <div className="map-stats">
            <div>
              <span>Shortest open wait</span>
              <strong>{shortest ? waitText(shortest.waitMin) : "n/a"}</strong>
              <small>{shortest?.name ?? "No open facilities"}</small>
            </div>
            <div>
              <span>Highest pressure</span>
              <strong>{longest ? waitText(longest.waitMin) : "n/a"}</strong>
              <small>{longest?.name ?? "No open facilities"}</small>
            </div>
          </div>

          {selected && (
            <article className="selected-card" data-severity={severityFor(selected.waitMin)}>
              <div className="selected-head">
                <span className="type-pill">{selected.type}</span>
                <span className="status-pill">{selected.open ? "Open" : "Closed"}</span>
              </div>
              <h2>{selected.name}</h2>
              <p>{selected.subtitle} · {selected.audience}</p>
              <div className="selected-wait">
                <strong>{selected.waitText}</strong>
                <span>{severityLabel(selected.waitMin)} · updated {selected.lastUpdated}</span>
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
                  {routeLoading ? "Routing..." : "Directions"}
                </button>
                <button type="button" onClick={() => map.current?.easeTo({ center: [selected.lng, selected.lat], zoom: 13.2, duration: 650 })}>Center map</button>
                <a href={"tel:" + selected.phone}>Call</a>
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
            {facilities.map((facility) => (
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
          {!mapUnavailable && <div className="map-legend" aria-label="Wait severity legend">
            <span><i data-severity="short" />0-60m</span>
            <span><i data-severity="medium" />1-3h</span>
            <span><i data-severity="long" />3h+</span>
            <span><i data-severity="closed" />closed</span>
          </div>}
        </div>
      </section>
    </main>
  );
}
