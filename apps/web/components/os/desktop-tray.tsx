"use client";

import { useRef, useState, type ReactNode } from "react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import {
  TRAY_BOX,
  TRAY_PIP,
  Tray,
  TrayBalloon,
  TrayButton,
  useMinuteClock,
  type TraySlots,
} from "@camp404/os";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { burnCountdownLabel } from "@/lib/burn-countdown";
import type { ManifestTray } from "@/lib/programs";
import { LineIcon } from "./line-icons";

// The taskbar's right-hand end (the approved prototype's tray): the inbox
// bell, the system-health warning, the Burn countdown and the clock, in that
// order, each in a bordered box. Which of them there are is the manifest's to
// say, per mode (the restricted desktop gets no system health; the held one
// gets no tray at all). The pinned announcements live in the header now, so
// the tray no longer counts them.
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
/** A YYYY-MM-DD date as the tray's tooltip says it: "Sun 26 Apr". */
const DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
function day(iso: string): string {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(ms) ? iso : DATE.format(ms);
}

/** The bell's look in the tray: the bordered box and the magenta pip. */
export const TRAY_BELL = {
  triggerClassName: `${TRAY_BOX} w-auto outline-none hover:border-os-primary hover:bg-os-panel focus-visible:border-os-primary aria-expanded:border-os-primary`,
  badgeClassName: TRAY_PIP,
  icon: <LineIcon name="bell" className="size-4" />,
};

/** What the member sees when something is wrong; no detail (owner, 2026-09-25). */
export const HEALTH_SENTENCE = "Something in the app is not working right now.";

export const APPLICATION_SUBMITTED =
  "Application submitted. A captain will look at it soon, and you will hear in your Inbox.";

export interface DesktopTrayProps {
  tray: ManifestTray;
  /** The Burn's dates this year, if a captain set them. */
  burn: { start: string; end: string } | null;
  /** The year, for the countdown's tooltip ("AfrikaBurn 2027: …"). */
  year?: number | null;
  /**
   * Drawn over the clock's top edge, decorative and free of pointer events
   * unless it is itself a toy (Prince, asleep on the clock).
   */
  clockDecoration?: ReactNode;
  /** Open a console address the desktop's way (System status). */
  onOpenHref: (href: string) => void;
}

export function DesktopTray({
  tray,
  burn,
  year = null,
  clockDecoration,
  onOpenHref,
}: DesktopTrayProps) {
  const now = useMinuteClock();
  const slots: TraySlots = {};

  if (tray.inbox) {
    slots.inbox = <NotificationPanel count={tray.inbox.count} {...TRAY_BELL} />;
  }
  if (tray.health?.status === "warning") {
    slots.health = <HealthItem health={tray.health} onOpenHref={onOpenHref} />;
  }
  if (tray.balloon === "application_submitted") {
    // The restricted desktop's note, where the health item would be.
    slots.health = <ApplicationBalloon />;
  }
  const countdown = now ? burnCountdownLabel(now, burn) : null;
  if (countdown && burn) {
    slots.countdown = (
      <span
        title={`AfrikaBurn${year ? ` ${year}` : ""}: ${day(burn.start)} to ${day(burn.end)}`}
        className={`${TRAY_BOX} font-mono text-[11px] uppercase tracking-wider max-lg:hidden`}
      >
        {countdown}
      </span>
    );
  }
  slots.clock = (
    <div className="relative">
      {clockDecoration}
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
    </div>
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
  const icon = <LineIcon name="alert" className={`${ICON} text-os-primary`} />;

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
        <LineIcon name="info" className={ICON} />
      </TrayButton>
      <TrayBalloon open={open} onClose={() => setOpen(false)} anchor={button}>
        {APPLICATION_SUBMITTED}
      </TrayBalloon>
    </>
  );
}
