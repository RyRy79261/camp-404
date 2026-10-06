"use client";

import dynamic from "next/dynamic";

// The Voice panel's own chunk (#356): only a captain's desktop asks for it,
// and only after the page is live, so nobody else downloads it and it never
// holds up the first paint.

export const DesktopVoice = dynamic(
  () => import("./voice-panel").then((m) => m.DesktopVoice),
  { ssr: false },
);

export const PhoneVoiceSheet = dynamic(
  () => import("./voice-panel").then((m) => m.PhoneVoiceSheet),
  { ssr: false },
);
