"use client";

import Link from "next/link";
import { useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faChartLine, faHospital, faList, faMapLocationDot } from "@fortawesome/free-solid-svg-icons";

type AppTopBarActive = "list" | "map";

export function AppTopBar({ active }: { active: AppTopBarActive }) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => menuRef.current?.removeAttribute("open");

  return (
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <Link href="/" className="app-wordmark">
          <span className="app-wordmark-mark" aria-hidden="true">
            <FontAwesomeIcon icon={faHospital} />
          </span>
          <span>
            EDWT
            <small>Lower Mainland · BC</small>
          </span>
        </Link>

        <nav className="app-nav-tabs" aria-label="Primary">
          <Link href="/" className={active === "list" ? "active" : ""}>
            <FontAwesomeIcon icon={faList} aria-hidden="true" /> Facilities
          </Link>
          <Link href="/map" className={active === "map" ? "active" : ""}>
            <FontAwesomeIcon icon={faMapLocationDot} aria-hidden="true" /> Map
          </Link>
          <Link href="/admin">
            <FontAwesomeIcon icon={faChartLine} aria-hidden="true" /> Analytics
          </Link>
        </nav>

        <details className="app-mobile-menu" ref={menuRef}>
          <summary aria-label="Open page menu">
            <FontAwesomeIcon icon={faBars} aria-hidden="true" />
          </summary>
          <div className="app-mobile-menu-panel" role="menu">
            <Link href="/" className={active === "list" ? "active" : ""} onClick={closeMenu}>
              <FontAwesomeIcon icon={faList} aria-hidden="true" /> Facilities
            </Link>
            <Link href="/map" className={active === "map" ? "active" : ""} onClick={closeMenu}>
              <FontAwesomeIcon icon={faMapLocationDot} aria-hidden="true" /> Map
            </Link>
            <Link href="/admin" onClick={closeMenu}>
              <FontAwesomeIcon icon={faChartLine} aria-hidden="true" /> Analytics
            </Link>
          </div>
        </details>

        <div className="app-topbar-spacer" />
        <div className="app-live-pill">
          <span aria-hidden="true" />
          Live waits
        </div>
      </div>
    </header>
  );
}
