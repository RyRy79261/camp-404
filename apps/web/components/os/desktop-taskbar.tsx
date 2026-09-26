"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { CAMP_TIME_ZONE } from "@camp404/core";
import {
  GroupedStartMenu,
  Taskbar,
  useMinuteClock,
  type StartMenuGroup,
  type StartMenuItem,
  type TaskbarWindow,
} from "@camp404/os";
import { SignOutLink } from "@/components/auth/sign-out-link";
import { openReportProblem } from "@/components/feedback/report-problem";
import type { ClientProgram, ProgramManifest } from "@/lib/programs";
import { leadsLine } from "./account-chip";
import { DesktopTray } from "./desktop-tray";
import { LineIcon } from "./line-icons";
import { OsAvatar } from "./os-avatar";
import { folderIcon, programIcon } from "./program-icons";
import { desktopFolderKey } from "@camp404/types";

// The taskbar (the approved prototype's): "404 START", a button per open
// window, and the tray. What the Start menu lists and what the tray holds come
// from the member's manifest, built on the server, per mode.
//
// The Start menu (the prototype's): the magenta "CAMP 404 OS" spine, the
// member at the top, then three columns: Me with My teams under it, Camp with
// the Kitchen's programs under it, and the Captains folder's programs with
// the Terminal. Along the bottom: Tidy windows, Line up icons, Show desktop,
// Report a problem and Log off. It sits above every window and all chrome
// (band 100), at most half the screen high before it scrolls.

const ICON =
  "size-5 shrink-0 text-os-accent group-hover:text-os-bg group-focus-visible:text-os-bg";
const GLYPH = "size-4 shrink-0";

/** A plain left click, which the desktop handles itself; anything else is the browser's (a new tab). */
function plainClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** How the Start menu's groups stand side by side, by key. */
const COLUMNS = [["me", "my-teams"], ["camp", "kitchen"], ["captains"]];

export interface DesktopTaskbarProps {
  manifest: ProgramManifest;
  windows: readonly TaskbarWindow<string>[];
  topId: string | undefined;
  onToggleWindow: (id: string) => void;
  /** Open a program the way an icon does (the desktop's own navigation). */
  onOpenProgram: (program: ClientProgram) => void;
  /** Open a folder window by its desktop key. */
  onOpenFolder: (key: string) => void;
  /** Who is signed in, drawn at the top of the Start menu. */
  account: DesktopAccount;
  /**
   * A captain's head count, at the right of the Start menu's header (the
   * prototype's "34 MEMBERS" over a magenta "6 WAITING"). Null for anyone
   * else.
   */
  headcount?: { members: number; waiting: number } | null;
  /** The Burn's dates this year, for the tray's countdown. */
  burn: { start: string; end: string } | null;
  /** The year, for the countdown's tooltip. */
  year?: number | null;
  /** Drawn over the clock (Prince, asleep on it). */
  clockDecoration?: ReactNode;
  /** Open a console address the desktop's way (System status). */
  onOpenHref: (href: string) => void;
  /** Cascade the windows on the desktop, in their order. */
  onTidyWindows: () => void;
  /** Put the icons back in their default places. */
  onLineUpIcons: () => void;
  /** Minimise every window. */
  onShowDesktop: () => void;
}

/** Who is signed in: their name, rank label and the teams they lead. */
export interface DesktopAccount {
  name: string;
  rank: string;
  /** Team names they lead this year, in the camp's order. */
  leads: readonly string[];
}

export function DesktopTaskbar({
  manifest,
  windows,
  topId,
  onToggleWindow,
  onOpenProgram,
  onOpenFolder,
  account,
  headcount = null,
  burn,
  year = null,
  clockDecoration,
  onOpenHref,
  onTidyWindows,
  onLineUpIcons,
  onShowDesktop,
}: DesktopTaskbarProps) {
  const programs = new Map(manifest.programs.map((p) => [p.id, p]));
  const folders = new Map(manifest.folders.map((f) => [f.id, f]));

  const programRow = (
    program: ClientProgram,
    extra: Partial<StartMenuItem> = {},
  ): StartMenuItem => ({
    key: program.id,
    label: program.label,
    icon: programIcon(program)(ICON),
    ...(program.badge ? { badge: program.badge } : {}),
    ...extra,
    // A real link, so a middle click or a new tab still works; a plain click
    // goes through the desktop (the dirty guard, the last-seen copy, the
    // pending state).
    render: ({ onClick, children, ...row }) => (
      <Link
        href={program.href as Route}
        {...row}
        onClick={(e) => {
          if (!plainClick(e)) return;
          e.preventDefault();
          onClick();
          onOpenProgram(program);
        }}
      >
        {children}
      </Link>
    ),
  });

  const folderRow = (id: "teams" | "kitchen" | "captains") => {
    const folder = folders.get(id);
    if (!folder) return [];
    const key = desktopFolderKey(folder.id);
    return [
      {
        key,
        label: folder.label,
        icon: folderIcon()(ICON),
        onSelect: () => onOpenFolder(key),
      } satisfies StartMenuItem,
    ];
  };

  const section = (group: string) =>
    manifest.startMenu.find((s) => s.group === group);
  /** A group's own programs, its folders left out (they are expanded). */
  const sectionPrograms = (group: string): StartMenuItem[] =>
    (section(group)?.items ?? []).flatMap((item) => {
      if (item.kind !== "program") return [];
      const program = programs.get(item.id);
      return program ? [programRow(program)] : [];
    });

  const groups: StartMenuGroup[] = [];
  const me = section("me");
  if (me)
    groups.push({ key: "me", label: me.label, items: sectionPrograms("me") });
  // My teams: the team pages of the teams they are on, led first (the team
  // folders' order), then the Teams folder with every team.
  const myTeams: StartMenuItem[] = manifest.teamFolders.flatMap((folder) => {
    const page = folder.programs.find((p) => p.id === `team:${folder.team}`);
    return page
      ? [
          programRow(page, {
            ...(folder.lead
              ? { tag: { text: "Lead", spoken: "you lead it" } }
              : {}),
          }),
        ]
      : [];
  });
  const teamsFolder = folderRow("teams");
  if (myTeams.length + teamsFolder.length > 0) {
    groups.push({
      key: "my-teams",
      label: "My teams",
      items: [...myTeams, ...teamsFolder],
    });
  }
  const camp = section("camp");
  if (camp) {
    groups.push({
      key: "camp",
      label: camp.label,
      items: sectionPrograms("camp"),
    });
  }
  const kitchen = folders.get("kitchen");
  if (kitchen) {
    groups.push({
      key: "kitchen",
      label: kitchen.label,
      items: kitchen.programs.map((p) => programRow(p)),
    });
  }
  const captainsFolder = folders.get("captains");
  const captains = section("captains");
  if (captainsFolder || captains) {
    groups.push({
      key: "captains",
      label: captains?.label ?? "Captains",
      items: [
        ...(captainsFolder?.programs.map((p) => programRow(p)) ?? []),
        ...sectionPrograms("captains"),
      ],
    });
  }

  const footer: StartMenuItem[] = [
    {
      key: "tidy",
      label: "Tidy windows",
      icon: <LineIcon name="more" className={GLYPH} />,
      onSelect: onTidyWindows,
    },
    {
      key: "line-up",
      label: "Line up icons",
      icon: <LineIcon name="filter" className={GLYPH} />,
      onSelect: onLineUpIcons,
    },
    {
      key: "show-desktop",
      label: "Show desktop",
      icon: <LineIcon name="chevron-down" className={GLYPH} />,
      onSelect: onShowDesktop,
    },
    {
      key: "report",
      label: "Report a problem",
      icon: <LineIcon name="alert" className={GLYPH} />,
      onSelect: () => openReportProblem(),
    },
    {
      key: "log-off",
      label: "Log off",
      icon: <LineIcon name="logoff" className={GLYPH} />,
      muted: true,
      // Never a plain /auth/sign-out link: SignOutLink removes this
      // device's push token (and the desktop's windows) first.
      render: ({ onClick, children, ...row }) => (
        <SignOutLink {...row} onClick={() => onClick()}>
          {children}
        </SignOutLink>
      ),
    },
  ];

  const leads = leadsLine(account.leads);
  return (
    <Taskbar
      console
      windows={windows}
      topId={topId}
      onToggleWindow={onToggleWindow}
      startLabel={
        <>
          {/* The number is the look; the button's name is "Start". */}
          <span aria-hidden className="os-chromatic">
            404
          </span>{" "}
          Start
        </>
      }
      renderStartMenu={({ anchor, onClose }) => (
        <GroupedStartMenu
          groups={groups}
          columns={COLUMNS}
          footer={footer}
          header={
            <div className="flex items-center gap-3">
              <OsAvatar name={account.name} size="md" />
              <p className="flex min-w-0 flex-col leading-tight normal-case">
                <span className="truncate text-sm font-semibold text-os-fg">
                  {account.name}
                </span>
                <span className="truncate text-xs text-os-muted">
                  {account.rank}
                  {leads && ` · ${leads}`}
                </span>
              </p>
              {headcount && (
                <p className="ml-auto shrink-0 text-right font-mono text-[10px] uppercase leading-tight tracking-wider text-os-muted">
                  {headcount.members}{" "}
                  {headcount.members === 1 ? "member" : "members"}
                  <br />
                  <span className="text-[color-mix(in_oklch,var(--os-primary)_70%,var(--os-fg))]">
                    {headcount.waiting} waiting
                  </span>
                </p>
              )}
            </div>
          }
          label="Start"
          banner="Camp 404 OS"
          anchor={anchor}
          onClose={onClose}
          landmark="Console"
        />
      )}
      onShowDesktop={onShowDesktop}
      tray={
        <DesktopTray
          tray={manifest.tray}
          burn={burn}
          year={year}
          clockDecoration={clockDecoration}
          onOpenHref={onOpenHref}
        />
      }
    />
  );
}

/**
 * The held desktop's taskbar, as the prototype draws it behind a blocking
 * form: the bar, its Start slab and the clock, dimmed under the form. A
 * picture only (hidden from assistive tech, nothing on it takes a press):
 * the desktop behind the form is inert, and nothing here may open.
 */
export function EmptyTaskbar() {
  const now = useMinuteClock();
  return (
    <div
      aria-hidden
      data-os-held-taskbar
      className="fixed inset-x-0 bottom-0 z-[90] flex h-10 select-none items-center gap-1 border-t border-os-primary/60 bg-os-chrome px-1"
    >
      <span className="flex h-8 shrink-0 items-center gap-2 border border-os-line bg-os-panel px-3 font-pixel text-xs uppercase text-os-fg">
        <span className="os-chromatic">404</span> Start
      </span>
      <span className="mx-0.5 h-6 w-px shrink-0 bg-os-line" />
      <span className="flex-1" />
      <span className="flex h-8 min-w-16 shrink-0 flex-col items-end justify-center border border-os-line bg-os-bg px-2 font-mono leading-none whitespace-nowrap text-os-fg">
        <span className="text-[12px]">{now ? HELD_CLOCK.format(now) : ""}</span>
      </span>
    </div>
  );
}

const HELD_CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: CAMP_TIME_ZONE,
});
