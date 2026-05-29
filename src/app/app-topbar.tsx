"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faChartLine, faHospital, faList, faMapLocationDot } from "@fortawesome/free-solid-svg-icons";

type AppTopBarActive = "list" | "map" | "analytics";

type NavIndicator = {
  left: number;
  width: number;
  ready: boolean;
  animate: boolean;
};

const NAV_ITEMS = [
  { id: "list", href: "/", label: "Facilities", icon: faList },
  { id: "map", href: "/map", label: "Map", icon: faMapLocationDot },
  { id: "analytics", href: "/analytics", label: "Analytics", icon: faChartLine },
] satisfies Array<{ id: AppTopBarActive; href: string; label: string; icon: typeof faList }>;

const LAST_ACTIVE_KEY = "edwt:last-active-tab";

export function AppTopBar({ active }: { active: AppTopBarActive }) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<Record<AppTopBarActive, HTMLAnchorElement | null>>({
    list: null,
    map: null,
    analytics: null,
  });
  const [indicator, setIndicator] = useState<NavIndicator>({
    left: 0,
    width: 0,
    ready: false,
    animate: false,
  });
  const closeMenu = () => menuRef.current?.removeAttribute("open");

  useLayoutEffect(() => {
    const measure = (tab: AppTopBarActive) => {
      const link = linkRefs.current[tab];
      if (!link) return null;
      return { left: link.offsetLeft, width: link.offsetWidth };
    };

    const current = measure(active);
    if (!current) return undefined;

    let previousActive: AppTopBarActive | null = null;
    try {
      previousActive = window.sessionStorage.getItem(LAST_ACTIVE_KEY) as AppTopBarActive | null;
    } catch {
      previousActive = null;
    }

    const previous = previousActive && previousActive !== active ? measure(previousActive) : null;
    let firstFrame = 0;
    let secondFrame = 0;

    if (previous) {
      setIndicator({ ...previous, ready: true, animate: false });
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          setIndicator({ ...current, ready: true, animate: true });
        });
      });
    } else {
      setIndicator({ ...current, ready: true, animate: false });
      firstFrame = window.requestAnimationFrame(() => {
        setIndicator((state) => ({ ...state, animate: true }));
      });
    }

    try {
      window.sessionStorage.setItem(LAST_ACTIVE_KEY, active);
    } catch {
      // Ignore private-mode storage failures; the indicator still lands correctly.
    }

    const resizeObserver = new ResizeObserver(() => {
      const next = measure(active);
      if (next) setIndicator({ ...next, ready: true, animate: false });
    });

    if (navRef.current) resizeObserver.observe(navRef.current);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      resizeObserver.disconnect();
    };
  }, [active]);

  return (
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <Link href="/" className="app-wordmark">
          <span className="app-wordmark-mark" aria-hidden="true">
            <FontAwesomeIcon icon={faHospital} />
          </span>
          <span>EDWT</span>
        </Link>

        <nav className="app-nav-tabs" aria-label="Primary" ref={navRef}>
          <span
            className={`app-nav-indicator${indicator.ready ? " is-ready" : ""}${indicator.animate ? " is-animated" : ""}`}
            style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
            aria-hidden="true"
          />
          {NAV_ITEMS.map((item) => (
            <Link
              href={item.href}
              key={item.id}
              className={active === item.id ? "active" : ""}
              ref={(node) => {
                linkRefs.current[item.id] = node;
              }}
            >
              <FontAwesomeIcon icon={item.icon} aria-hidden="true" /> {item.label}
            </Link>
          ))}
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
            <Link href="/analytics" className={active === "analytics" ? "active" : ""} onClick={closeMenu}>
              <FontAwesomeIcon icon={faChartLine} aria-hidden="true" /> Analytics
            </Link>
          </div>
        </details>

        <div className="app-topbar-spacer" />
        <div className="app-live-pill">
          <span aria-hidden="true" />
          Live wait times
        </div>
      </div>
    </header>
  );
}
