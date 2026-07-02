import { healthAuthorityFor } from "@/lib/health-authorities";

/** Favicon-in-ring badge — same treatment as the /map markers. 22px default. */
export function HABadge({ name, address = null, size = 22 }: { name: string; address?: string | null; size?: number }) {
  const a = healthAuthorityFor({ name, address });
  const logo = Math.round(size * (14 / 22));
  return (
    <span
      className="ha"
      style={{ width: size, height: size, background: a.badgeBackground }}
      title={a.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.faviconPath} alt={a.name} width={logo} height={logo} />
    </span>
  );
}
