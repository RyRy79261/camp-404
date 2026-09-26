"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Info, Pin } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import {
  Tray,
  TrayBalloon,
  TrayButton,
  useMinuteClock,
  type TraySlots,
} from "@camp404/os";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { burnCountdownLabel } from "@/lib/burn-countdown";
import type { ManifestTray } from "@/lib/programs";

// The taskbar's right-hand end (visual-language doc 4.7): the inbox bell, the
// pinned count, the system-health warning, the Burn countdown and the clock,
// in that order. Which of them there are is the manifest's to say, per mode
// (the restricted desktop gets no pins and no system health; the held one
// gets no tray at all).
//
// Cheap when idle (design doc, section 8): the clock ticks once a minute on
// the minute and stops while the tab is hidden, and only this component
// re-renders when it does.

const ICON = "size-4";

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: CAMP_TIME_ZONE,
});
const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});

/** What the member sees when something is wrong; no detail (owner, 2026-09-25). */
export const HEALTH_SENTENCE = "Something in the app is not working right now.";

export const APPLICATION_SUBMITTED =
  "Application submitted. A captain will look at it soon, and you will hear in your Inbox.";

export interface DesktopTrayProps {
  tray: ManifestTray;
  /** How many pinned announcements the strip holds (cleared members only). */
  pinned: number;
  /** The Burn's dates this year, if a captain set them. */
  burn: { start: string; end: string } | null;
  /** Open a console address the desktop's way (System status). */
  onOpenHref: (href: string) => void;
}

export function DesktopTray({
  tray,
  pinned,
  burn,
  onOpenHref,
}: DesktopTrayProps) {
  const now = useMinuteClock();
  const slots: TraySlots = {};

  if (tray.inbox) {
    slots.inbox = <NotificationPanel count={tray.inbox.count} />;
  }
  if (pinned > 0) {
    slots.pins = (
      <TrayButton
        label="Pinned announcements"
        count={pinned}
        countNoun="pinned"
        onClick={() => {
          // The strip is always drawn; the tray item takes the member to it.
          document
            .querySelector<HTMLElement>("[data-os-pins] a[href]")
            ?.focus();
        }}
      >
        <Pin aria-hidden className={ICON} />
      </TrayButton>
    );
  }
  if (tray.health?.status === "warning") {
    slots.health = <HealthItem health={tray.health} onOpenHref={onOpenHref} />;
  }
  if (tray.balloon === "application_submitted") {
    // The restricted desktop's note, where the health item would be.
    slots.health = <ApplicationBalloon />;
  }
  const countdown = now ? burnCountdownLabel(now, burn) : null;
  if (countdown) {
    slots.countdown = (
      <span className="flex h-8 shrink-0 items-center border border-os-line bg-os-panel px-2 font-mono text-[11px] uppercase tracking-wider text-os-fg">
        {countdown}
      </span>
    );
  }
  slots.clock = (
    <time
      dateTime={now?.toISOString()}
      // Null until mounted, so the server's paint and the first client one
      // agree; the box keeps its width meanwhile.
      className="flex h-8 min-w-16 shrink-0 flex-col items-end justify-center border border-os-line bg-os-bg px-2 font-mono leading-none whitespace-nowrap text-os-fg"
    >
      <span className="text-[12px]">{now ? CLOCK.format(now) : ""}</span>
      <span className="text-[9px] uppercase text-os-muted">
        {now ? DAY.format(now) : ""}
      </span>
    </time>
  );

  return <Tray slots={slots} />;
}

export function HealthItem({
  health,
  onOpenHref,
}: {
  health: NonNullable<ManifestTray["health"]>;
  onOpenHref: (href: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const icon = (
    <AlertTriangle aria-hidden className={`${ICON} text-os-primary`} />
  );

  // A captain: the count, and System status.
  if ("warnings" in health) {
    return (
      <TrayButton
        label="System health"
        count={health.warnings}
        countNoun={health.warnings === 1 ? "warning" : "warnings"}
        onClick={() => onOpenHref(health.href)}
      >
        {icon}
      </TrayButton>
    );
  }
  // Anyone else: one plain sentence, and nowhere to go.
  return (
    <>
      <TrayButton
        ref={button}
        label="System health"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
      </TrayButton>
      <TrayBalloon open={open} onClose={() => setOpen(false)} anchor={button}>
        {HEALTH_SENTENCE}
      </TrayBalloon>
    </>
  );
}

/** The restricted desktop's "Application submitted" balloon, open at first. */
function ApplicationBalloon() {
  const [open, setOpen] = useState(true);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <TrayButton
        ref={button}
        label="Application submitted"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Info aria-hidden className={ICON} />
      </TrayButton>
      <TrayBalloon open={open} onClose={() => setOpen(false)} anchor={button}>
        {APPLICATION_SUBMITTED}
      </TrayBalloon>
    </>
  );
}
