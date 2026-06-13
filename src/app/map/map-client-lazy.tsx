"use client";

import dynamic from "next/dynamic";

const MapClientDynamic = dynamic(
  () => import("./map-client").then((m) => m.MapClient),
  {
    ssr: false,
    loading: () => <MapLoadingShell />,
  },
);

type MapClientLazyProps = React.ComponentProps<typeof MapClientDynamic>;

function MapLoadingShell() {
  return (
    <main className="map-page">
      <section className="map-shell map-shell-loading" aria-busy="true" aria-label="Loading facility map">
        <aside className="map-sidebar">
          <div className="map-copy">
            <p className="eyebrow">Loading map</p>
            <h1>Nearby facilities</h1>
            <p>Preparing live wait-time markers, facility details, and local map controls.</p>
          </div>

          <div className="map-stats map-loading-stats">
            <div>
              <span className="map-loading-bar map-loading-bar-short" />
              <strong className="map-loading-bar map-loading-bar-value" />
              <small className="map-loading-bar map-loading-bar-label" />
            </div>
            <div>
              <span className="map-loading-bar map-loading-bar-short" />
              <strong className="map-loading-bar map-loading-bar-value" />
              <small className="map-loading-bar map-loading-bar-label" />
            </div>
          </div>

          <article className="selected-card map-loading-card">
            <div className="selected-head">
              <span className="map-loading-pill" />
              <span className="map-loading-pill map-loading-pill-small" />
            </div>
            <span className="map-loading-bar map-loading-title" />
            <span className="map-loading-bar map-loading-subtitle" />
            <div className="selected-wait">
              <strong className="map-loading-bar map-loading-wait" />
              <span className="map-loading-bar map-loading-wait-label" />
            </div>
            <div className="map-loading-actions">
              <span />
              <span />
              <span />
            </div>
          </article>

          <div className="facility-scroll">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="facility-row map-loading-row" key={index}>
                <span className="row-dot" />
                <span className="row-main">
                  <strong className="map-loading-bar" />
                  <small className="map-loading-bar" />
                </span>
                <span className="map-loading-bar map-loading-row-wait" />
              </div>
            ))}
          </div>
        </aside>

        <div className="map-canvas-wrap">
          <div className="map-canvas map-loading-canvas" />
          <div className="map-loading-overlay" aria-hidden="true">
            <div className="map-pin-loader">
              <div className="map-pin-icon">
                <svg viewBox="0 0 24 34" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 7.2 12 22 12 22s12-14.8 12-22C24 5.373 18.627 0 12 0z" fill="currentColor" />
                  <circle cx="12" cy="12" r="4.5" fill="white" />
                </svg>
              </div>
              <div className="map-pin-shadow" />
              <div className="map-pin-ring" />
              <div className="map-pin-ring" />
              <div className="map-pin-ring" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export function MapClientLazy(props: MapClientLazyProps) {
  return <MapClientDynamic {...props} />;
}
