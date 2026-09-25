import type { ReactNode } from "react";
import type { AppId } from "@/lib/window-manager";

// Thin line-art icons, drawn for Camp 404 on a 48-unit grid. They take the
// current colour, so the desktop decides their tint.

const PATHS: Record<AppId, ReactNode> = {
  readme: (
    <>
      <path d="M12 5h17l9 9v29H12z" />
      <path d="M29 5v9h9" />
      <path d="M17 22h16M17 28h16M17 34h10" />
    </>
  ),
  teams: (
    <>
      <path d="M5 13h14l4 4h20v24H5z" />
      <circle cx="18" cy="27" r="3" />
      <circle cx="30" cy="27" r="3" />
      <path d="M12 37c1-4 4-5 6-5s5 1 6 5M24 37c1-4 4-5 6-5s5 1 6 5" />
    </>
  ),
  gifts: (
    <>
      <path d="M8 19h32v7H8zM11 26h26v16H11z" />
      <path d="M24 19v23" />
      <path d="M24 19c-2-6-10-9-11-4s8 4 11 4c3 0 12 1 11-4s-9-2-11 4" />
    </>
  ),
  map: (
    <>
      <path d="M5 12l12-4 14 4 12-4v28l-12 4-14-4-12 4z" />
      <path d="M17 8v28M31 12v28" />
      <path d="M24 30s-6-6-6-10a6 6 0 0 1 12 0c0 4-6 10-6 10z" />
      <circle cx="24" cy="20" r="2" />
    </>
  ),
  crew: (
    <>
      <ellipse cx="24" cy="11" rx="14" ry="5" />
      <path d="M10 11v26c0 3 6 5 14 5s14-2 14-5V11" />
      <path d="M10 20c0 3 6 5 14 5s14-2 14-5M10 29c0 3 6 5 14 5s14-2 14-5" />
    </>
  ),
  schedule: (
    <>
      <rect x="7" y="10" width="34" height="31" />
      <path d="M7 18h34M15 6v8M33 6v8" />
      <path d="M13 24h4M22 24h4M31 24h4M13 30h4M22 30h4M13 36h4" />
      <path d="M30 31l3 3 5-6" />
    </>
  ),
  fee: (
    <>
      <rect x="11" y="5" width="26" height="38" />
      <rect x="15" y="9" width="18" height="8" />
      <path d="M16 23h3M23 23h3M30 23h2M16 29h3M23 29h3M30 29h2M16 35h3M23 35h3M30 35h2v4" />
    </>
  ),
  perks: (
    <>
      <path d="M9 24v-6a3 3 0 0 1 3-3h24a3 3 0 0 1 3 3v6" />
      <path d="M6 24h36v10H6zM9 34v5M39 34v5" />
      <path d="M13 24v-3h9v3M26 24v-3h9v3" />
      <path d="M24 5l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5-2.5-2.5 3.5-.5z" />
    </>
  ),
  truck: (
    <>
      <path d="M4 12h24v22H4zM28 19h9l6 7v8H28z" />
      <path d="M31 22h5l3 4h-8z" />
      <circle cx="12" cy="36" r="4" />
      <circle cx="35" cy="36" r="4" />
    </>
  ),
  terminal: (
    <>
      <rect x="5" y="8" width="38" height="32" />
      <path d="M5 14h38" />
      <path d="M11 21l6 5-6 5M20 32h9" />
    </>
  ),
  inkblot: (
    <>
      <path d="M12 38c-4-2-5-8-2-12 1-6 7-9 12-8l3-8 4 7c4 0 8 2 10 5l6-6-1 9c3 4 2 10-2 13-6 4-24 4-30 0z" />
      <path d="M18 28h0M30 28h0" strokeWidth={3} />
      <path d="M40 38c4 1 6 4 4 7" />
    </>
  ),
  apply: (
    <>
      <path d="M10 20V7l8 7h12l8-7v13" />
      <path d="M10 20c0 11 6 20 14 20s14-9 14-20" />
      <path d="M18 24v2M30 24v2" />
      <path d="M22 31h4l-2 2z" />
      <path d="M4 29l10 1M4 35l10-2M44 29l-10 1M44 35l-10-2" />
    </>
  ),
};

export function AppIcon({ id, className }: { id: AppId; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      className={className}
    >
      {PATHS[id]}
    </svg>
  );
}
