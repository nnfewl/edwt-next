# i18n Design — French Language Support

**Date**: 2026-06-11
**Status**: Approved
**Approach**: next-intl in cookie mode (no URL prefix routing)

## Overview

Add French (fr) as a second language to edwt.ca using next-intl configured in cookie-only mode. Routes stay unchanged (`/`, `/map`, `/analytics`). A toggle in the topbar switches between English and French by setting a cookie and refreshing.

All public pages are in scope: facilities list, map, analytics, nav, and metadata.

## Decisions

- **Library**: next-intl — purpose-built for Next.js App Router, supports both server and client components, handles locale negotiation and metadata helpers.
- **Routing**: No URL prefixes. Locale stored in `NEXT_LOCALE` cookie. Middleware reads the cookie (falling back to `Accept-Language` header, then `"en"`).
- **Toggle UX**: Two-letter button in the topbar (shows `FR` when in English, `EN` when in French). Sets cookie + `router.refresh()`.
- **Facility names and addresses stay English** — proper nouns, not translated.

## File Structure

### Translation files

```
messages/
  en.json
  fr.json
```

Organized by namespace matching component/page boundaries:

```json
{
  "nav": {
    "facilities": "Facilities",
    "map": "Map",
    "analytics": "Analytics",
    "liveWaitTimes": "Live wait times"
  },
  "facilities": {
    "emergency": "Emergency",
    "upcc": "UPCC",
    "walkInUpcc": "Walk-in / UPCC",
    "pediatric": "Pediatric",
    "allFacilities": "All facilities",
    "openNow": "Open now",
    "shortestWait": "Shortest wait",
    "closestFirst": "Closest first",
    "nameAZ": "Name A-Z",
    "directions": "Directions",
    "call": "Call",
    "details": "Details",
    "website": "Website",
    "waiting": "{count} waiting",
    "onDuty": "{count} on duty",
    "kmAway": "{distance} km",
    "preciseLocation": "Precise location",
    "approximateLocation": "Approximate location",
    "usePreciseLocation": "Use precise location",
    "gettingLocation": "Getting precise location",
    "preciseEnabled": "Precise location enabled",
    "locationDenied": "Location permission was denied",
    "locationUnavailable": "Precise location is unavailable",
    "gpsNeedsHttps": "GPS needs HTTPS on mobile devices",
    "noFacilitiesOpen": "No facilities are currently reporting as open.",
    "noWaitTimes": "No posted wait times are available right now.",
    "feedPaused": "The live feed may be paused or every site in range is closed.",
    "noWaitData": "Open facilities may still be accepting patients, but the live feed has not posted wait data."
  },
  "common": {
    "closed": "Closed",
    "open": "Open",
    "shortWait": "Short wait",
    "moderateWait": "Moderate wait",
    "longWait": "Long wait",
    "noData": "No data"
  },
  "map": {
    "title": "Facility Map",
    "description": "Interactive map of emergency departments and urgent care centres in the Lower Mainland, BC with live wait times and directions.",
    "noData": "No data",
    "routeDistance": "{distance} km",
    "routeDuration": "{duration} min"
  },
  "analytics": {
    "heroTitle": "Wait-time analytics",
    "heroSubtitle": "A system-level view of current pressure, sustained risk, coverage quality, and care-type trends across tracked facilities.",
    "liveAnalytics": "Live wait-time analytics",
    "dataWindow": "Data window",
    "latestSourceReading": "Latest source reading",
    "facilitiesTracked": "Facilities tracked",
    "readingsCaptured": "Readings captured",
    "pollArchive": "Poll archive",
    "freshness": "Freshness",
    "executiveReadout": "Executive readout",
    "whatNeedsAttention": "What needs attention now",
    "currentHighestPressure": "Current highest pressure",
    "highestSustainedAverage": "Highest sustained average",
    "edAccessGap": "ED access gap",
    "coverageNote": "Coverage note",
    "careType": "Care type",
    "edVsUpcc": "ED vs UPCC",
    "medianWaitTime": "Median wait time",
    "p90WaitTime": "P90 wait time",
    "currentWaitPressure": "Current wait-time pressure",
    "aboveBaselineSignals": "Above-baseline signals",
    "sustainedHighWaitTimes": "Sustained high wait times",
    "volatility": "Volatility",
    "facility": "Facility",
    "type": "Type",
    "waitTime": "Wait time",
    "estimatedLengthOfStay": "Estimated length of stay",
    "observed": "Observed",
    "currentWait": "Current wait time",
    "averageWait": "Average wait time",
    "deltaFromAverage": "Delta from average",
    "zScore": "Z-score",
    "medianWait": "Median wait time",
    "maxWait": "Max wait time",
    "standardDeviation": "Standard deviation",
    "readings": "Readings",
    "locationsWithoutReadings": "Locations without wait-time readings",
    "showWaitTimes": "Show wait times",
    "fallbackText": "Fallback wait-time text",
    "databaseUnavailable": "Database unavailable",
    "backToFacilities": "Back to facilities"
  },
  "metadata": {
    "siteTitle": "EDWT · Lower Mainland ED & UPCC Wait Times",
    "siteDescription": "Live wait times for emergency departments and urgent care centres across the Lower Mainland, BC. Updated every minute from the edwaittimes.ca feed.",
    "ogTitle": "EDWT · Live ED & UPCC Wait Times"
  }
}
```

`fr.json` has identical keys with French translations.

### next-intl configuration files

**`src/i18n/config.ts`** — shared constants:
```ts
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
```

**`src/i18n/request.ts`** — server-side locale resolution:
```ts
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, locales, type Locale } from "./config";

export default getRequestConfig(async () => {
  // 1. Check NEXT_LOCALE cookie
  // 2. Fall back to Accept-Language header
  // 3. Default to "en"
  const locale = resolvedLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

**`middleware.ts`** — reads cookie, sets locale header. No redirects or URL rewriting.

**`next.config.ts`** — wrap existing config with `createNextIntlPlugin()`:
```ts
import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
// ... existing sentry wrapping
export default withSentryConfig(withNextIntl(nextConfig), { ... });
```

**`layout.tsx`** — dynamic `<html lang>` and provider:
```tsx
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

export default async function RootLayout({ children }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} ...>
      <body>
        <NextIntlClientProvider messages={messages}>
          <AppTopBar />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

## Component Changes

### Server components

Use `getTranslations(namespace)`:
```ts
const t = await getTranslations("analytics");
return <h1>{t("heroTitle")}</h1>;
```

### Client components

Use `useTranslations(namespace)`:
```ts
const t = useTranslations("facilities");
return <span>{t("directions")}</span>;
```

### Dynamic status functions (`data.ts`)

`severityLabel()` and `facilityWaitStatusLabel()` currently return hardcoded English strings. Two options:

**Option chosen**: These functions return translation keys (e.g. `"common.shortWait"`), and calling components resolve them via `t()`. This keeps `data.ts` locale-agnostic.

### Intl formatting

Existing `Intl.DateTimeFormat` and `Intl.NumberFormat` calls (in `analytics/page.tsx` and `page-client.tsx`) should use the current locale instead of hardcoded `"en-CA"` / `"en-US"`:
- `new Intl.DateTimeFormat(locale, ...)` — dates render in French format when in `fr`
- `new Intl.NumberFormat(locale, ...)` — number separators adapt (1,000 vs 1 000)
- `toLocaleDateString(locale, ...)` and `toLocaleTimeString(locale, ...)` for hero date/time

## Language Toggle

Added to `AppTopBar`, positioned near the "Live wait times" pill:

```tsx
function LocaleToggle() {
  const locale = useLocale();
  const router = useRouter();
  const nextLocale = locale === "en" ? "fr" : "en";

  const switchLocale = () => {
    document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000`;
    router.refresh();
  };

  return (
    <button onClick={switchLocale} aria-label={`Switch to ${nextLocale === "fr" ? "French" : "English"}`}>
      {nextLocale.toUpperCase()}
    </button>
  );
}
```

Displays `FR` when viewing in English, `EN` when viewing in French.

## Metadata & SEO

- `<html lang>` set dynamically from `getLocale()`
- OpenGraph `locale` switches between `en_CA` and `fr_CA`
- Page `title` and `description` read from translation files
- Add `<link rel="alternate" hreflang="en">` and `<link rel="alternate" hreflang="fr">` in the head
- Structured data (JSON-LD) descriptions translated

## What Stays English

- Facility names (proper nouns: "Surrey Memorial Hospital")
- Facility addresses
- Database content, API responses
- Internal analytics column names in queries
- Git/dev tooling

## String Extraction Scope

| Component | Approx. strings | Notes |
|---|---|---|
| `app-topbar.tsx` | ~5 | Nav labels, live pill |
| `page-client.tsx` | ~50 | Filters, sorts, status, drawer, empty states, location UI |
| `map-client.tsx` | ~25 | Bottom sheet, route info, status labels |
| `analytics/page.tsx` | ~60 | Headings, table headers, metric labels, methodology |
| `analytics/analytics-charts.tsx` | ~15 | Chart titles and axis labels |
| `data.ts` | ~8 | Severity/status label keys |
| `layout.tsx` | ~5 | Site title, description, OG metadata |
| **Total** | **~170** | |

## Dependencies

- `next-intl` (npm package) — the only new dependency

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Cookie not set on first visit → wrong language | Middleware falls back to `Accept-Language` header, then `"en"` |
| next-intl + Sentry config plugin wrapping conflicts | Test the double-wrap (`withSentryConfig(withNextIntl(...))`) early |
| Large translation files slow down client bundle | next-intl tree-shakes to only the namespaces used per page; messages passed via provider are already scoped |
| French translations inaccurate | Have a native speaker review `fr.json` before shipping |
