"use client";

import dynamic from "next/dynamic";

// The desktop's cats, fetched after the desktop is up and never part of its
// first bundle (the games are @camp404/games; the placements are
// cats-on-desktop.tsx). Client-only: they are decoration, and none of them
// has anything to say to the server's first paint. Until one arrives it is
// nothing, except Shadow Work, whose strip keeps its height so the Teams
// folder's icons do not jump when it lands.

/** Shadow Work's strip height (@camp404/games's SHADOW_WORK_STRIP_H). */
export const SHADOW_WORK_STRIP_PX = 180;

export const ClockPrince = dynamic(
  () => import("./cats-on-desktop").then((m) => m.ClockPrince),
  { ssr: false },
);

export const WindowPeek = dynamic(
  () => import("./cats-on-desktop").then((m) => m.WindowPeek),
  { ssr: false },
);

export const TeamsFolderArt = dynamic(
  () => import("./cats-on-desktop").then((m) => m.TeamsFolderArt),
  {
    ssr: false,
    loading: () => <div aria-hidden style={{ height: SHADOW_WORK_STRIP_PX }} />,
  },
);

export const DesktopSecrets = dynamic(
  () => import("./cats-on-desktop").then((m) => m.DesktopSecrets),
  { ssr: false },
);
