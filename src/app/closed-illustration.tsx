import { type SVGProps } from "react";

export function ClosedIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      focusable="false"
      aria-hidden="true"
      {...props}
    >
      <path d="M13 54h38" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M22 53V19.5c0-3.6 2.9-6.5 6.5-6.5h13c3.6 0 6.5 2.9 6.5 6.5V53"
        fill="#f8fafc"
        stroke="#94a3b8"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M28 52V20h14v32" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
      <path d="M30 29h10M30 39h10" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
      <circle cx="39" cy="35" r="2.4" fill="#64748b" />
      <rect x="16" y="8" width="31" height="15" rx="7.5" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2.5" />
      <path d="M24 15.5h15" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M52 10.5c-3.1.6-5.4 3.3-5.4 6.6s2.3 6 5.4 6.6c-1.2.7-2.6 1.1-4.1 1.1a7.7 7.7 0 0 1 0-15.4c1.5 0 2.9.4 4.1 1.1Z" fill="#cbd5e1" />
      <path d="M14 31l2 2 2-2M50 35l1.7 1.7 1.7-1.7" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
