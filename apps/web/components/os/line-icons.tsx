import type { ReactNode } from "react";

// The 404 OS program drawings, from the approved prototype
// (apps/join/app/prototype/captain-desktop/_proto/program-icons.tsx): line art
// on a 24-unit grid in Join's grammar (stroke 1.5, square caps, mitred joins,
// currentColor). Glyphs at the bottom are for controls. Decorative: the
// control that draws one carries the name.

export const PROGRAM_ICON_KEYS = [
  "inbox",
  "tasks",
  "calendar",
  "roster",
  "lineage",
  "minutes",
  "power",
  "myforms",
  "keygen",
  "account",
  "cookbook",
  "mealplan",
  "review",
  "campstat",
  "forms",
  "broadcast",
  "newevent",
  "ledger",
  "settings",
  "joinsite",
  "audit",
  "sysmon",
  "folder",
  "folder-open",
  "today",
  "terminal",
  "cat",
  "lift",
] as const;

export const GLYPH_KEYS = [
  "plus",
  "check",
  "x",
  "search",
  "chevron-left",
  "chevron-right",
  "chevron-down",
  "alert",
  "info",
  "logoff",
  "more",
  "filter",
  "download",
  "send",
  "edit",
  "trash",
  "pin",
  "clock",
  "user",
  "bell",
] as const;

export type ProgramIconKey = (typeof PROGRAM_ICON_KEYS)[number];
export type GlyphKey = (typeof GLYPH_KEYS)[number];
export type IconKey = ProgramIconKey | GlyphKey;

const PATHS: Record<IconKey, ReactNode> = {
  inbox: (
    <>
      <path d="M3 6h18v13H3z" />
      <path d="M3 6l9 7 9-7" />
    </>
  ),
  tasks: (
    <>
      <path d="M3 4h18v16H3z" />
      <path d="M9 4v16M15 4v16" />
      <path d="M5 7h2M5 10h2M11 7h2M17 7h2M17 10h2M17 13h2" />
    </>
  ),
  calendar: (
    <>
      <path d="M4 5h16v15H4z" />
      <path d="M4 9h16M8 3v4M16 3v4" />
      <path d="M10 12h4v5" />
      <path d="M10 17h4" />
    </>
  ),
  roster: (
    <>
      <path d="M3 7h18v12H3z" />
      <path d="M6 7V5h12v2" />
      <path d="M6 11h3v3H6zM11 11h7M11 14h5" />
    </>
  ),
  lineage: (
    <>
      <path d="M10 3h4v4h-4zM3 17h4v4H3zM10 17h4v4h-4zM17 17h4v4h-4z" />
      <path d="M12 7v6M5 17v-4h14v4M12 13v4" />
    </>
  ),
  minutes: (
    <>
      <path d="M5 3h11v18H5z" />
      <path d="M8 7h5M8 10h5M8 13h3" />
      <path d="M20 5l1.5 1.5L15 13l-2 .5.5-2z" />
    </>
  ),
  power: (
    <>
      <path d="M8 3v5M16 3v5" />
      <path d="M5 8h14v4a7 7 0 0 1-14 0z" />
      <path d="M13 11l-3 4h4l-3 4" />
    </>
  ),
  myforms: (
    <>
      <path d="M3 6h7l2 2h9v12H3z" />
      <path d="M7 12h10M7 15h10M7 18h6" />
    </>
  ),
  keygen: (
    <>
      <path d="M4 11h6v6H4z" />
      <path d="M10 14h11M17 14v3M20 14v3" />
      <path d="M6 13h2v2H6z" />
    </>
  ),
  account: (
    <>
      <path d="M3 5h18v14H3z" />
      <path d="M6 9h4v4H6z" />
      <path d="M5 16c.5-1.5 1.5-2 3-2s2.5.5 3 2" />
      <path d="M13 9h5M13 12h5M13 15h3" />
    </>
  ),
  cookbook: (
    <>
      <path d="M12 6v14M12 6c-2-2-6-2-9-1v14c3-1 7-1 9 1M12 6c2-2 6-2 9-1v14c-3-1-7-1-9 1" />
      <path d="M16 9v5M15 9v2h2V9" />
    </>
  ),
  mealplan: (
    <>
      <path d="M3 4h18v16H3z" />
      <path d="M3 9h18M9 4v16M15 4v16" />
      <path d="M17 14a1.5 1.5 0 1 0 1.5 1.5" />
    </>
  ),
  review: (
    <>
      <path d="M4 3h10v18H4z" />
      <path d="M7 7h4M7 10h4" />
      <path d="M13 11h5v5h-5z" />
      <path d="M18 16l3 3" />
    </>
  ),
  campstat: (
    <>
      <path d="M3 20h18" />
      <path d="M5 13h3v7H5zM10.5 8h3v12h-3zM16 4h3v16h-3z" />
    </>
  ),
  forms: (
    <>
      <path d="M5 5h14v16H5z" />
      <path d="M9 3h6v4H9z" />
      <path d="M8 11h2v2H8zM12 12h4M8 16h2v2H8zM12 17h4" />
    </>
  ),
  broadcast: (
    <>
      <path d="M3 10h4l9-5v14l-9-5H3z" />
      <path d="M7 14l2 6h3l-2-6" />
      <path d="M19 9v6" />
    </>
  ),
  newevent: (
    <>
      <path d="M3 5h15v15H3z" />
      <path d="M3 9h15M7 3v4M14 3v4" />
      <path d="M18 14v8M14 18h8" />
    </>
  ),
  ledger: (
    <>
      <path d="M4 3h16v18H4z" />
      <path d="M8 3v18" />
      <path d="M11 16V8h3a2 2 0 0 1 0 4h-3M14 12l2.5 4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <path d="M8 4v4h3V4zM14 10v4h3v-4zM6 16v4h3v-4z" />
    </>
  ),
  joinsite: (
    <>
      <path d="M2 4h20v16H2z" />
      <path d="M2 8h20" />
      <path d="M12 10a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9zM7.5 14.5h9M12 10c-2 2.5-2 6.5 0 9M12 10c2 2.5 2 6.5 0 9" />
    </>
  ),
  audit: (
    <>
      <path d="M6 3h12v3H6zM6 18h12v3H6z" />
      <path d="M7 6v12M17 6v12" />
      <path d="M10 9h4M10 12h4M10 15h2" />
    </>
  ),
  sysmon: (
    <>
      <path d="M2 4h20v14H2z" />
      <path d="M5 11h3l2-4 3 8 2-4h4" />
      <path d="M8 21h8M12 18v3" />
    </>
  ),
  folder: (
    <>
      <path d="M2 5h8l2 2h10v13H2z" />
      <path d="M2 9h20" />
    </>
  ),
  "folder-open": (
    <>
      <path d="M2 5h8l2 2h8v3" />
      <path d="M2 5v15h17l3-10H5L2 20" />
    </>
  ),
  terminal: (
    <>
      <path d="M3 4h18v16H3z" />
      <path d="M7 9l3 3-3 3M12 15h5" />
    </>
  ),
  cat: (
    <>
      <path d="M5 20V9L4 3l5 4h6l5-4-1 6v11z" />
      <path d="M9 12v1M15 12v1M11 16h2" />
    </>
  ),
  // My lift (not in the prototype, drawn to its grammar): a car side on.
  lift: (
    <>
      <path d="M2 16v-4l3-5h11l4 5h2v4z" />
      <path d="M5 12h15M11 7v5" />
      <path d="M6 16a2 2 0 1 0 4 0M15 16a2 2 0 1 0 4 0" />
    </>
  ),
  today: (
    <>
      <path d="M3 4h18v16H3z" />
      <path d="M3 8h18" />
      <path d="M7 12l2 2 4-4M7 17h10" />
    </>
  ),

  // --- glyphs ---
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12l5 5 9-10" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  search: (
    <>
      <path d="M4 4h11v11H4z" />
      <path d="M15 15l5 5" />
    </>
  ),
  "chevron-left": <path d="M15 5l-7 7 7 7" />,
  "chevron-right": <path d="M9 5l7 7-7 7" />,
  "chevron-down": <path d="M5 9l7 7 7-7" />,
  alert: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 17v1.5" />
    </>
  ),
  info: (
    <>
      <path d="M3 3h18v18H3z" />
      <path d="M12 10v7M12 6.5V8" />
    </>
  ),
  logoff: (
    <>
      <path d="M12 3v8" />
      <path d="M7 6a8 8 0 1 0 10 0" />
    </>
  ),
  more: <path d="M5 12h1M12 12h1M19 12h1" strokeWidth={2.5} />,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 17v4h16v-4" />
    </>
  ),
  send: (
    <>
      <path d="M3 11l18-8-6 18-3-7z" />
      <path d="M12 14l9-11" />
    </>
  ),
  edit: (
    <>
      <path d="M16 3l5 5L9 20H4v-5z" />
      <path d="M13 6l5 5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6h16M9 6V3h6v3" />
      <path d="M6 6l1 15h10l1-15" />
      <path d="M10 10v7M14 10v7" />
    </>
  ),
  pin: (
    <>
      <path d="M8 3h8l-1 7 3 3H6l3-3z" />
      <path d="M12 13v8" />
    </>
  ),
  clock: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  user: (
    <>
      <path d="M8 4h8v8H8z" />
      <path d="M4 21c1-5 4-6 8-6s7 1 8 6" />
    </>
  ),
  bell: (
    <>
      <path d="M6 17V10a6 6 0 0 1 12 0v7l2 2H4z" />
      <path d="M10 21h4" />
    </>
  ),
};

/** One line-art icon or glyph. Decorative: the caller labels the control. */
export function LineIcon({
  name,
  className,
}: {
  name: IconKey;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
