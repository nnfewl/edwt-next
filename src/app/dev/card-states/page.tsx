import type { Metadata } from "next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faDiamondTurnRight,
  faLocationDot,
  faMoon,
  faPhone,
} from "@fortawesome/free-solid-svg-icons";
import { ClosedIllustration } from "../../closed-illustration";
import "../../styles.css";
import "./demo.css";

// Dev-only design playground: Closed & No-data wait-column redesigns rendered
// on the REAL facility card (same markup, same styles.css). Everything outside
// the .wait column is untouched — that's the whole point.
export const metadata: Metadata = {
  title: "DEV · Card states",
  robots: { index: false, follow: false },
};

const closed = {
  name: "Mount Saint Joseph Hospital",
  subtitle: "Emergency Department",
  audience: "All ages",
  hours: "8:00 a.m. - 8:00 p.m.",
  open: false,
  address: "3080 Prince Edward St, Vancouver, BC, V5T 3N4",
  street: "3080 Prince Edward St",
  city: "Vancouver, BC",
  distanceKm: 14.5,
};

const noData = {
  name: "Royal Columbian Hospital",
  subtitle: "Emergency Department",
  audience: "All ages",
  hours: "Open 24 / 7",
  open: true,
  address: "330 East Columbia Street, New Westminster, BC, V3L 3W7",
  street: "330 East Columbia Street",
  city: "New Westminster, BC",
  distanceKm: 2.3,
  phone: "(604) 520-4253",
};

type MockFacility = typeof closed & { phone?: string };

/** Exact copy of FacilityCard's left column + shell; only `wait` is injected. */
function Card({ f, wait }: { f: MockFacility; wait: React.ReactNode }) {
  return (
    <article className="facility" data-severity="closed">
      <div className="left">
        <div className="badges">
          <span className="badge emergency">
            <span className="bdot" />
            Emergency
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
            <span className="distance-note" aria-label={`${f.distanceKm} km away`}>
              <FontAwesomeIcon icon={faLocationDot} width={12} height={12} aria-hidden="true" />
              {f.distanceKm} km
            </span>
            <span className="m address-line">
              <span className="addr-desktop">{f.address}</span>
              <span className="addr-street">{f.street}</span>
              <span className="addr-city">{f.city}</span>
            </span>
          </span>
        </div>

        <div className="actions">
          <a className="action-btn primary" href="#" title="Directions">
            <FontAwesomeIcon icon={faDiamondTurnRight} width={14} height={14} aria-hidden="true" />{" "}
            <span className="action-label">Directions</span>
          </a>
          <a className="action-btn call-btn" href="#" title="Call">
            <FontAwesomeIcon icon={faPhone} width={14} height={14} aria-hidden="true" />{" "}
            <span className="action-label">Call</span>
          </a>
          <button className="action-btn" type="button" title="Details">
            <FontAwesomeIcon icon={faCircleInfo} width={14} height={14} aria-hidden="true" />{" "}
            <span className="action-label">Details</span>
          </button>
        </div>
      </div>

      {wait}
    </article>
  );
}

const DashedCircle = () => (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9.2" strokeDasharray="3.5 4" />
    <path d="M8 12h2.6M13.4 12H16" />
  </svg>
);

function SectionHead({ tag, title, note }: { tag: string; title: string; note: string }) {
  return (
    <header className="csd-head">
      <div>
        <span className="csd-tag">{tag}</span> <strong>{title}</strong>
      </div>
      <p>{note}</p>
    </header>
  );
}

export default function CardStatesPage() {
  return (
    <div className="er-now-root">
      <main className="page csd-page">
        <h1 className="csd-title">Closed &amp; No-data — wait-column options</h1>
        <p className="csd-sub">
          The card is the real production card (same markup, same CSS). Only the right-hand
          state section differs between options. <b>D</b> follows the researched pattern
          (Google/Apple Maps status grammar; AHS explains missing data instead of alarming);
          A–C are kept as earlier explorations.
        </p>

        <SectionHead tag="CURRENT" title="What's live today" note="Door illustration + big 'No data'." />
        <div className="facility-list">
          <Card
            f={closed}
            wait={
              <div className="wait is-closed" data-sev="closed">
                <div className="closed-state">
                  <ClosedIllustration className="closed-illustration closed-hero" />
                  <strong>Closed</strong>
                </div>
              </div>
            }
          />
          <Card
            f={noData}
            wait={
              <div className="wait is-no-data" data-sev="closed">
                <div className="no-data-state">
                  <strong>No data</strong>
                  <span>No wait posted</span>
                </div>
              </div>
            }
          />
        </div>

        <SectionHead
          tag="D · RESEARCH PICK"
          title="Maps grammar"
          note="The pattern Google & Apple Maps trained everyone on: one inline line — red 'Closed · Opens 8:00 a.m.' / green 'Open' — plus a quiet second line. No icons, no panels, instantly familiar."
        />
        <div className="facility-list">
          <Card
            f={closed}
            wait={
              <div className="wait is-closed csd-d" data-sev="closed">
                <div className="csd-d-line">
                  <b className="csd-d-closed">Closed</b>
                  <span className="csd-d-dot"> · </span>
                  <span>Opens 8:00 a.m.</span>
                </div>
                <span className="csd-d-sub">8:00 a.m. – 8:00 p.m. daily</span>
              </div>
            }
          />
          <Card
            f={noData}
            wait={
              <div className="wait is-no-data csd-d" data-sev="closed">
                <div className="csd-d-line">
                  <b className="csd-d-open">Open</b>
                  <span className="csd-d-dot"> · </span>
                  <span>no posted wait</span>
                </div>
                <a className="csd-d-call" href="#">
                  <FontAwesomeIcon icon={faPhone} width={12} height={12} aria-hidden="true" /> Call to check
                </a>
              </div>
            }
          />
        </div>

        <SectionHead tag="A" title="Next-open first" note="Small glyph; the reopen time is the headline fact. No-data reassures and offers a call." />
        <div className="facility-list">
          <Card
            f={closed}
            wait={
              <div className="wait is-closed csd-a" data-sev="closed">
                <span className="csd-a-glyph"><FontAwesomeIcon icon={faMoon} width={17} height={17} aria-hidden="true" /></span>
                <span className="csd-a-label">Closed for the night</span>
                <span className="csd-a-hero">Opens <em>8:00 a.m.</em></span>
                <span className="csd-a-sub">Daily hours 8:00 a.m. – 8:00 p.m.</span>
              </div>
            }
          />
          <Card
            f={noData}
            wait={
              <div className="wait is-no-data csd-a" data-sev="closed">
                <span className="csd-a-glyph"><DashedCircle /></span>
                <span className="csd-a-label">Open now</span>
                <span className="csd-a-hero csd-a-hero-muted">No posted wait</span>
                <a className="csd-a-call" href="#">
                  <FontAwesomeIcon icon={faPhone} width={12} height={12} aria-hidden="true" /> Call to check
                </a>
              </div>
            }
          />
        </div>

        <SectionHead tag="B" title="Status panel" note="Hatched panel keeps the column's weight; pill states the status; Call chip on no-data." />
        <div className="facility-list">
          <Card
            f={closed}
            wait={
              <div className="wait is-closed csd-b" data-sev="closed">
                <div className="csd-b-panel">
                  <span className="csd-b-pill csd-b-pill-closed">
                    <FontAwesomeIcon icon={faMoon} width={11} height={11} aria-hidden="true" /> CLOSED
                  </span>
                  <span className="csd-b-line">Reopens <em>8:00 a.m.</em></span>
                  <span className="csd-b-foot">daily 8 a.m. – 8 p.m.</span>
                </div>
              </div>
            }
          />
          <Card
            f={noData}
            wait={
              <div className="wait is-no-data csd-b" data-sev="closed">
                <div className="csd-b-panel csd-b-panel-plain">
                  <span className="csd-b-pill csd-b-pill-nodata">
                    <DashedCircle /> NO POSTED WAIT
                  </span>
                  <span className="csd-b-foot">Open — this site doesn&apos;t publish waits</span>
                  <a className="csd-b-cta" href="#">
                    <FontAwesomeIcon icon={faPhone} width={12} height={12} aria-hidden="true" /> Call (604) 520-4253
                  </a>
                </div>
              </div>
            }
          />
        </div>

        <SectionHead tag="C" title="Ghost numeral" note="The reopen time takes the big-number slot; no-data shows a ghost dash — an absence, not an error." />
        <div className="facility-list">
          <Card
            f={closed}
            wait={
              <div className="wait is-closed csd-c" data-sev="closed">
                <span className="csd-c-eyebrow">
                  <FontAwesomeIcon icon={faMoon} width={12} height={12} aria-hidden="true" /> CLOSED · REOPENS
                </span>
                <div className="csd-c-num">8<small>a.m.</small></div>
                <span className="csd-c-sub">daily 8 a.m. – 8 p.m.</span>
              </div>
            }
          />
          <Card
            f={noData}
            wait={
              <div className="wait is-no-data csd-c" data-sev="closed">
                <span className="csd-c-eyebrow">
                  <DashedCircle /> OPEN · NO POSTED WAIT
                </span>
                <div className="csd-c-num csd-c-ghost">——</div>
                <span className="csd-c-sub"><a href="#">Call to check current wait</a></span>
              </div>
            }
          />
        </div>
      </main>
    </div>
  );
}
