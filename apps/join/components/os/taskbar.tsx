"use client";

import { useEffect, useState } from "react";
import { Taskbar as OsTaskbar } from "@camp404/os";
import { APPS, appById } from "@/lib/apps";
import { DESKTOP } from "@/lib/content";
import { useJoinData } from "./join-data";
import {
  burnCountdown,
  burnDatesLabel,
  countdownLabel,
  countdownShort,
  tankwaToday,
  type BurnCountdown,
} from "@/lib/countdown";
import type { AppId, JoinWindow } from "@/lib/window-manager";
import { AppIcon } from "./icons";

type Props = {
  windows: JoinWindow[];
  topId: AppId | undefined;
  onOpen: (id: AppId) => void;
  /** A window's taskbar button: minimise it if it is on top, else raise it. */
  onToggleWindow: (id: AppId) => void;
  onReboot: () => void;
};

function useBurnCountdown(burn: { start: string; end: string } | null) {
  const [c, setC] = useState<BurnCountdown | null>(null);
  useEffect(() => {
    if (!burn) return;
    const tick = () => setC(burnCountdown(tankwaToday(new Date()), burn));
    tick();
    const t = window.setInterval(tick, 60_000);
    return () => window.clearInterval(t);
  }, [burn]);
  return c;
}

// The start bar along the bottom (owner, 2026-09-25: somewhere to open and
// minimise): a Start menu of every program, a button per open window, and
// a countdown to the Burn (owner, 2026-09-25).
export function Taskbar({
  windows,
  topId,
  onOpen,
  onToggleWindow,
  onReboot,
}: Props) {
  const { burn } = useJoinData();
  const countdown = useBurnCountdown(burn);

  return (
    <OsTaskbar
      windows={windows.map((w) => ({
        id: w.id,
        label: appById(w.id).label,
        icon: <AppIcon id={w.id} className="size-4 shrink-0 text-os-accent" />,
        minimized: w.minimized,
      }))}
      topId={topId}
      onToggleWindow={onToggleWindow}
      startLabel={
        <>
          <span className="os-chromatic">404</span> Start
        </>
      }
      startBanner="Camp 404 OS"
      startItems={[
        ...APPS.map((app) => ({
          key: app.id,
          label: app.label,
          icon: <AppIcon id={app.id} className="size-5 text-os-accent" />,
          onSelect: () => onOpen(app.id),
        })),
        {
          key: "reboot",
          label: DESKTOP.reboot,
          onSelect: onReboot,
          muted: true,
          separated: true,
        },
      ]}
      tray={
        // No dates yet (a captain sets them in the app): no countdown.
        burn && (
          <div
            title={`AfrikaBurn: ${burnDatesLabel(burn)}`}
            className="flex h-8 shrink-0 items-center border border-os-line bg-os-panel px-2 font-mono text-[11px] uppercase tracking-wider text-os-fg sm:px-3"
          >
            <span className="sm:hidden">
              {countdown ? countdownShort(countdown) : "T-…"}
            </span>
            <span className="hidden sm:inline">
              {countdown ? countdownLabel(countdown) : "T-…"}
            </span>
          </div>
        )
      }
    />
  );
}
