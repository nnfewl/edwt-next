"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faChartLine, faHospital, faList, faMapLocationDot } from "@fortawesome/free-solid-svg-icons";
import { useLocale, useTranslations } from "next-intl";

type AppTopBarActive = "list" | "map" | "analytics";

type NavIndicator = {
  left: number;
  width: number;
  ready: boolean;
  animate: boolean;
};

const NAV_ITEMS = [
  { id: "list", href: "/", labelKey: "facilities", icon: faList },
  { id: "map", href: "/map", labelKey: "map", icon: faMapLocationDot },
  { id: "analytics", href: "/analytics", labelKey: "analytics", icon: faChartLine },
] satisfies Array<{ id: AppTopBarActive; href: string; labelKey: string; icon: typeof faList }>;

function activeFromPathname(pathname: string): AppTopBarActive {
  if (pathname.startsWith("/map")) return "map";
  if (pathname.startsWith("/analytics") || pathname.startsWith("/admin")) return "analytics";
  return "list";
}

function LocaleToggle() {
  const locale = useLocale();
  const router = useRouter();
  const nextLocale = locale === "en" ? "fr" : "en";

  const switchLocale = () => {
    document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };

  return (
    <button
      className="app-locale-toggle"
      type="button"
      onClick={switchLocale}
      aria-label={nextLocale === "fr" ? "Passer au français" : "Switch to English"}
    >
      {nextLocale.toUpperCase()}
    </button>
  );
}

export function AppTopBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = activeFromPathname(pathname);
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

    let firstFrame = 0;

    setIndicator((state) => {
      if (state.ready) return { ...current, ready: true, animate: true };
      firstFrame = window.requestAnimationFrame(() => {
        setIndicator((state) => ({ ...state, animate: true }));
      });
      return { ...current, ready: true, animate: false };
    });

    const resizeObserver = new ResizeObserver(() => {
      const next = measure(active);
      if (next) setIndicator({ ...next, ready: true, animate: false });
    });

    if (navRef.current) resizeObserver.observe(navRef.current);

    return () => {
      window.cancelAnimationFrame(firstFrame);
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

        <nav className={`app-nav-tabs${indicator.ready ? " is-ready" : ""}`} aria-label="Primary" ref={navRef}>
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
              aria-current={active === item.id ? "page" : undefined}
              ref={(node) => {
                linkRefs.current[item.id] = node;
              }}
            >
              <FontAwesomeIcon icon={item.icon} aria-hidden="true" /> {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <details className="app-mobile-menu" ref={menuRef}>
          <summary aria-label="Open page menu">
            <FontAwesomeIcon icon={faBars} aria-hidden="true" />
          </summary>
          <div className="app-mobile-menu-panel" role="menu">
            <Link href="/" className={active === "list" ? "active" : ""} onClick={closeMenu}>
              <FontAwesomeIcon icon={faList} aria-hidden="true" /> {t("facilities")}
            </Link>
            <Link href="/map" className={active === "map" ? "active" : ""} onClick={closeMenu}>
              <FontAwesomeIcon icon={faMapLocationDot} aria-hidden="true" /> {t("map")}
            </Link>
            <Link href="/analytics" className={active === "analytics" ? "active" : ""} onClick={closeMenu}>
              <FontAwesomeIcon icon={faChartLine} aria-hidden="true" /> {t("analytics")}
            </Link>
          </div>
        </details>

        <div className="app-topbar-spacer" />
        <LocaleToggle />
        <div className="app-live-pill">
          <span aria-hidden="true" />
          {t("liveWaitTimes")}
        </div>
      </div>
    </header>
  );
}
