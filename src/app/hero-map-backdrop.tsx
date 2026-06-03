type HeroMapBackdropProps = {
  className: string;
  pictureClassName: string;
  imageClassName: string;
  originLat?: number;
  originLng?: number;
};

// Tile grid: zoom 11, cols 322-326, rows 700-702, @2x (512px tiles)
// Stitched image: 2560×1536 native, displayed at 1280×768
const Z_N = 2048; // 2^11
const TX0 = 322;
const TY0 = 700;
const TILE_PX = 512;
const DISPLAY_CX = 640; // 1280 / 2
const DISPLAY_CY = 384; // 768 / 2
const MAX_SHIFT_PX = 50;

function geoToDisplayPx(lat: number, lng: number) {
  const tileX = ((lng + 180) / 360) * Z_N;
  const r = (lat * Math.PI) / 180;
  const tileY =
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Z_N;
  return {
    x: ((tileX - TX0) * TILE_PX) / 2,
    y: ((tileY - TY0) * TILE_PX) / 2,
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

const DISPLAY_W = 1280;
const DISPLAY_H = 768;

function heroMapPanStyle(
  lat: number,
  lng: number,
): Record<string, string> | undefined {
  const p = geoToDisplayPx(lat, lng);
  if (p.x < 0 || p.x > DISPLAY_W || p.y < 0 || p.y > DISPLAY_H)
    return undefined;
  const dx = clamp(DISPLAY_CX - p.x, -MAX_SHIFT_PX, MAX_SHIFT_PX);
  const dy = clamp(DISPLAY_CY - p.y, -MAX_SHIFT_PX, MAX_SHIFT_PX);
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return undefined;
  return {
    transform: `translate(calc(-50% + ${Math.round(dx)}px), calc(-50% + ${Math.round(dy)}px))`,
  };
}

export function HeroMapBackdrop({
  className,
  pictureClassName,
  imageClassName,
  originLat,
  originLng,
}: HeroMapBackdropProps) {
  const panStyle =
    originLat != null && originLng != null
      ? heroMapPanStyle(originLat, originLng)
      : undefined;

  return (
    <div className={className} aria-hidden="true">
      <picture className={pictureClassName} style={panStyle}>
        <source media="(max-width: 760px)" type="image/avif" srcSet="/hero-map-nolabels.avif" />
        <source media="(max-width: 760px)" type="image/webp" srcSet="/hero-map-nolabels.webp" />
        <source media="(max-width: 760px)" srcSet="/hero-map-nolabels.png" />
        <source type="image/avif" srcSet="/hero-map-all.avif" />
        <source type="image/webp" srcSet="/hero-map-all.webp" />
        <img
          className={imageClassName}
          src="/hero-map-all.png"
          width={2560}
          height={1536}
          alt=""
          decoding="async"
          fetchPriority="low"
          draggable={false}
        />
      </picture>
    </div>
  );
}
