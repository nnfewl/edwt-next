import type { Metadata } from "next";
import { AutoRefresh } from "../auto-refresh";
import { HeroMapBackdrop } from "../hero-map-backdrop";
import { SiteFooter } from "../site-footer";
import { getAnalytics } from "./analytics-data";
import { PressureHero } from "./charts/PressureHero";
import { StatStrip } from "./charts/StatStrip";
import { RankedBars } from "./charts/RankedBars";
import { HourHeatmap } from "./charts/HourHeatmap";
import { DayProfile } from "./charts/DayProfile";
import { WeekTiles } from "./charts/WeekTiles";
import { GapTrend } from "./charts/GapTrend";
import { WaitDistribution } from "./charts/WaitDistribution";
import { VisitCost } from "./charts/VisitCost";
import { SwingScatter } from "./charts/SwingScatter";
import { MonthCalendar } from "./charts/MonthCalendar";
import { LeagueTable } from "./charts/LeagueTable";
import { BumpChart } from "./charts/BumpChart";
import { RecordsBoard } from "./charts/RecordsBoard";
import { HoverTip } from "./charts/HoverTip";
import "./styles.css";

export const metadata: Metadata = {
  title: "Wait-Time Analytics",
  description: "The story of ER pressure across the Lower Mainland — live wait times, daily and weekly rhythms, records, and trends.",
  alternates: { canonical: "/analytics" },
};

// ISR: each regeneration renders HTML + RSC from one data snapshot (getAnalytics
// is request-cached), and the client charts are pure functions of their props, so
// the prerendered page hydrates cleanly. On a data error the page throws, which
// keeps serving the last good cached copy instead of baking an error page.
// maxDuration must cover a cold query batch or background regeneration fails
// silently and the page goes stale-forever (observed in prod at 25h stale).
export const revalidate = 60;
export const maxDuration = 60;

const localFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});
function fmtDate(value: Date | string | null | undefined) {
  if (!value) return "n/a";
  return localFormatter.format(new Date(value));
}

const SUB = {
  s01: "Latest posted wait at each facility, and how it compares to that facility's usual level for this hour.",
  s02: "The region's daily cycle over the past 30 days — and each facility's own version of it.",
  s03: "Median ER wait by day of week, past 30 days. Click a day to see its full curve.",
  s04: "Median wait by care type, past 30 days. UPCCs treat non-life-threatening conditions walk-in.",
  s05: "Current wait plus the facility's own estimated length of stay (ELOS) — the closest thing to a door-to-discharge estimate.",
  s06: "Each facility's 30-day median wait against how much it typically swings. Right = longer, up = less predictable.",
  s07: "Each square is one day, colored by the region's median ER wait. This view keeps growing as history accumulates.",
  s08: "30-day median per facility, its evening peak, the last 30 days as a sparkline, and whether the last week improved.",
  s09: "Weekly ranking by median wait, longest at the top. Like league standings, but you want to be at the bottom.",
  s10: "The superlatives of the last 30 days — the extremes hiding inside the averages.",
};

function Eyebrow({ n, label }: { n: string; label: string }) {
  return <div className="sec-eyebrow"><span>{n}</span>{label}</div>;
}

export default async function AnalyticsPage() {
  const result = await getAnalytics();
  if (result.error || !result.view) {
    throw new Error(`Analytics data unavailable: ${result.error ?? "No data returned"}`);
  }
  const v = result.view;
  const hasRange = !!v.meta.firstObserved || !!v.meta.lastObserved;
  const dataWindow = hasRange ? `${fmtDate(v.meta.firstObserved)} to ${fmtDate(v.meta.lastObserved)} PT` : "Current facility snapshot";
  const latestSourceReading = v.meta.lastReading ? `${fmtDate(v.meta.lastReading)} PT` : "Snapshot mode";

  return (
    <div className="analytics-root">
      {/* eslint-disable-next-line react-hooks/purity -- deliberate: stamp the
          server render time so the client can detect a stale prerender. */}
      <AutoRefresh intervalMs={300_000} generatedAtMs={Date.now()} staleAfterMs={180_000} />
      <main className="analytics-page">
        {/* Kept header: map-background hero (unchanged from the original page). */}
        <section className="analytics-hero">
          <HeroMapBackdrop
            className="analytics-hero-map"
            pictureClassName="analytics-hero-map-picture"
            imageClassName="analytics-hero-map-image"
          />
          <div className="analytics-hero-copy">
            <div className="analytics-kicker"><span aria-hidden="true" /> Live wait-time analytics</div>
            <h1>Wait-time analytics</h1>
            <p>
              The story of ER pressure across the region — what waits look like right now, when the calm windows come, and how the month has run.
            </p>
          </div>
          <aside className="analytics-window" aria-label="Data window">
            <div>
              <span>Data window</span>
              <strong>{dataWindow}</strong>
            </div>
            <div>
              <span>Latest source reading</span>
              <strong>{latestSourceReading}</strong>
            </div>
          </aside>
        </section>

        {/* Redesigned charts (Sage), scoped to .analytics-redesign. */}
        <div className="analytics-redesign">
          <HoverTip />
          <PressureHero status={v.status} ratio={v.ratio} context={v.heroContext} drivers={v.heroDrivers} today={v.heroToday} typical={v.heroTypical} />
          <StatStrip shortest={v.shortest} longest={v.longest} reporting={v.reporting} quietWindow={v.quietWindow} />

          <section className="block">
            <Eyebrow n="01" label="Right now" />
            <h2 className="finding">{v.section01}</h2>
            <p className="finding-sub">{SUB.s01}</p>
            <RankedBars rows={v.facilitiesNow} />
          </section>

          <section className="block">
            <Eyebrow n="02" label="The rhythm" />
            <h2 className="finding">{v.section02}</h2>
            <p className="finding-sub">{SUB.s02}</p>
            <div className="duo">
              <HourHeatmap cells={v.heat} />
              <DayProfile profile={v.profile} bestWindow={v.bestWindow} bestHours={v.bestHours} />
            </div>
          </section>

          <section className="block">
            <Eyebrow n="03" label="The week" />
            <h2 className="finding">{v.section03}</h2>
            <p className="finding-sub">{SUB.s03}</p>
            <WeekTiles week={v.week} typical={v.weekTypical} today={v.heroToday} todayDow={v.todayDow} />
          </section>

          <section className="block">
            <Eyebrow n="04" label="ER vs urgent care" />
            <h2 className="finding">{v.section04}</h2>
            <p className="finding-sub">{SUB.s04}</p>
            <div className="duo">
              <GapTrend gap={v.gap} />
              <WaitDistribution buckets={v.distribution} regionalMedian={v.regionalMedian} />
            </div>
          </section>

          <section className="block">
            <Eyebrow n="05" label="The full visit" />
            <h2 className="finding">{v.section05}</h2>
            <p className="finding-sub">{SUB.s05}</p>
            <VisitCost rows={v.visit} />
          </section>

          <section className="block">
            <Eyebrow n="06" label="Steady or a gamble" />
            <h2 className="finding">{v.section06}</h2>
            <p className="finding-sub">{SUB.s06}</p>
            <SwingScatter points={v.scatter} />
          </section>

          <section className="block">
            <Eyebrow n="07" label="The month" />
            <h2 className="finding">{v.section07}</h2>
            <p className="finding-sub">{SUB.s07}</p>
            <MonthCalendar days={v.calendar} />
          </section>

          <section className="block">
            <Eyebrow n="08" label="The long game" />
            <h2 className="finding">{v.section08}</h2>
            <p className="finding-sub">{SUB.s08}</p>
            <LeagueTable rows={v.league} />
          </section>

          <section className="block">
            <Eyebrow n="09" label="The standings race" />
            <h2 className="finding">{v.section09}</h2>
            <p className="finding-sub">{SUB.s09}</p>
            <div className="card"><BumpChart rows={v.bump} climber={v.moverClimber} slider={v.moverSlider} /></div>
          </section>

          <section className="block">
            <Eyebrow n="10" label="Records & oddities" />
            <h2 className="finding">{v.section10}</h2>
            <p className="finding-sub">{SUB.s10}</p>
            <RecordsBoard tiles={v.records} moonNote={v.moonNote} />
          </section>

          <p className="about">
            <b>About this data.</b> Wait times are the figures each facility posts publicly, collected every minute from the official edwaittimes.ca feed. &ldquo;Typical&rdquo; ranges are per-facility medians for the same hour and day-of-week over the past 28 days. Posted waits are estimates made by the facilities themselves — sicker patients are always seen first. Facilities that don&apos;t publish wait times are excluded from regional numbers, not counted as zero.
          </p>
        </div>

        <SiteFooter />
      </main>
    </div>
  );
}
