import { ImageResponse } from "next/og";

// Root-level og:image — inherited by /, /map, and /analytics so every share
// renders a card instead of a bare link. (layout.tsx already declares
// `twitter.card: summary_large_image`; platforms fall back to og:image.)
export const alt = "EDWT — live emergency department wait times for the Lower Mainland, BC";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#17201d";
const CREAM = "#faf8f4";
const TEAL = "#0f766e";
const GREEN = "#4ade80";
const MUTED = "rgba(250, 248, 244, 0.62)";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: INK,
          backgroundImage:
            `radial-gradient(820px 420px at 88% -10%, rgba(15, 118, 110, 0.55), transparent 70%), ` +
            `radial-gradient(640px 380px at -6% 110%, rgba(74, 222, 128, 0.18), transparent 70%)`,
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 58,
              height: 58,
              borderRadius: 16,
              backgroundColor: TEAL,
              color: CREAM,
              fontSize: 36,
              fontWeight: 700,
            }}
          >
            +
          </div>
          <div style={{ display: "flex", color: CREAM, fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
            EDWT
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              color: CREAM,
              fontSize: 84,
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1.06,
            }}
          >
            <span>
              Find the <span style={{ color: GREEN, marginLeft: 20 }}>shortest</span>
            </span>
            <span>ED wait near you.</span>
          </div>
          <div style={{ display: "flex", color: MUTED, fontSize: 30, lineHeight: 1.3 }}>
            Live waits for every reporting emergency department &amp; urgent care centre.
          </div>
        </div>

        {/* Live badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              width: 16,
              height: 16,
              borderRadius: 999,
              backgroundColor: GREEN,
            }}
          />
          <div style={{ display: "flex", color: MUTED, fontSize: 26 }}>
            Live wait times · Lower Mainland, BC · edwt.ca
          </div>
        </div>
      </div>
    ),
    size,
  );
}
