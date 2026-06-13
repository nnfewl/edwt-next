import { HeroMapBackdrop } from "./hero-map-backdrop";
import "./styles.css";

function Bar({ width = "100%", height = "14px" }: { width?: string; height?: string }) {
  return <span className="home-skeleton-bar" style={{ width, height }} />;
}

function SkeletonStat() {
  return (
    <div className="stat home-skeleton-fade">
      <div className="stat-label"><Bar width="86px" height="17px" /></div>
      <div style={{ marginTop: 8 }}><Bar width="110px" height="36px" /></div>
      <div style={{ marginTop: 10 }}><Bar width="150px" height="19px" /></div>
    </div>
  );
}

function SkeletonFacilityCard() {
  return (
    <article className="facility home-skeleton-fade" aria-hidden="true">
      <div className="left">
        <div className="badges">
          <Bar width="96px" height="27px" />
          <Bar width="110px" height="27px" />
          <Bar width="76px" height="27px" />
        </div>
        <div style={{ marginTop: 12 }}><Bar width="min(320px, 70%)" height="26px" /></div>
        <div style={{ marginTop: 10 }}><Bar width="min(420px, 88%)" height="21px" /></div>
        <div className="actions" style={{ marginTop: 14 }}>
          <Bar width="118px" height="36px" />
          <Bar width="92px" height="36px" />
        </div>
      </div>
      <div className="home-skeleton-wait">
        <Bar width="96px" height="49px" />
        <div style={{ marginTop: 10 }}><Bar width="120px" height="19px" /></div>
      </div>
    </article>
  );
}

export function HomeSkeleton() {
  return (
    <div className="er-now-root">
      <main className="page">
        <section className="hero">
          <HeroMapBackdrop
            className="hero-map"
            pictureClassName="hero-map-picture"
            imageClassName="hero-map-image"
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
          <div className="hero-meta home-skeleton-fade">
            <div className="locator">
              <Bar width="220px" height="40px" />
            </div>
          </div>
        </section>

        <div className="info-banner" role="alert">
          <div className="b-body">
            <strong>If this is a life-threatening emergency, call 9-1-1.</strong>{" "}
            Chest pain, severe bleeding, stroke symptoms, or difficulty breathing
            need immediate care. For non-urgent health advice, dial{" "}
            <a href="tel:811">8-1-1</a> to reach a registered nurse 24/7.
          </div>
        </div>

        <div className="stats">
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </div>

        <div className="home-skeleton-filters home-skeleton-fade" aria-hidden="true">
          <Bar width="280px" height="38px" />
          <Bar width="200px" height="38px" />
        </div>

        <div className="facility-list" aria-busy="true" aria-label="Loading facilities">
          <SkeletonFacilityCard />
          <SkeletonFacilityCard />
          <SkeletonFacilityCard />
          <SkeletonFacilityCard />
          <SkeletonFacilityCard />
        </div>
      </main>
    </div>
  );
}
