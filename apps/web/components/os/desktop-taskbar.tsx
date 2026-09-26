"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Bug, LayoutGrid, LogOut, Minimize2, UserRound } from "lucide-react";
import {
  GroupedStartMenu,
  Taskbar,
  type StartMenuGroup,
  type StartMenuItem,
  type TaskbarWindow,
} from "@camp404/os";
import { SignOutLink } from "@/components/auth/sign-out-link";
import { openReportProblem } from "@/components/feedback/report-problem";
import type { ClientProgram, ProgramManifest } from "@/lib/programs";
import { leadsLine } from "./account-chip";
import { DesktopTray } from "./desktop-tray";
import { drawIcon, iconFor, programIcon, teamIcon } from "./program-icons";
import { desktopFolderKey, desktopTeamFolderKey } from "@camp404/types";

// The taskbar (visual-language doc 4.7): Start, a button per open window, and
// the tray. What the Start menu lists and what the tray holds come from the
// member's manifest, built on the server, per mode.
//
// The Start menu: the member's programs in their groups (Me, Camp, Captains,
// then My teams), then Account, Report a problem, Line up icons, Show desktop
// and Log off. It sits above every window and all chrome (band 100), at most
// half the screen high on a desktop before it scrolls.

const ICON = "size-4 shrink-0";

/** A plain left click, which the desktop handles itself; anything else is the browser's (a new tab). */
function plainClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

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
  /** How many pinned announcements the strip holds. */
  pinned: number;
  /** The Burn's dates this year, for the tray's countdown. */
  burn: { start: string; end: string } | null;
  /** Open a console address the desktop's way (System status). */
  onOpenHref: (href: string) => void;
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
  pinned,
  burn,
  onOpenHref,
  onLineUpIcons,
  onShowDesktop,
}: DesktopTaskbarProps) {
  const programs = new Map(manifest.programs.map((p) => [p.id, p]));
  const folders = new Map(manifest.folders.map((f) => [f.id, f]));

  const programRow = (program: ClientProgram): StartMenuItem => ({
    key: program.id,
    label: program.label,
    icon: drawIcon(programIcon(program))(ICON),
    ...(program.badge ? { badge: program.badge } : {}),
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

  const groups: StartMenuGroup[] = manifest.startMenu.map((section) => ({
    key: section.group,
    label: section.label,
    items: section.items.flatMap((item): StartMenuItem[] => {
      if (item.kind === "program") {
        const program = programs.get(item.id);
        return program ? [programRow(program)] : [];
      }
      const folder = folders.get(item.id);
      if (!folder) return [];
      return [
        {
          key: desktopFolderKey(folder.id),
          label: folder.label,
          icon: drawIcon(iconFor(folder.icon))(ICON),
          onSelect: () => onOpenFolder(desktopFolderKey(folder.id)),
        },
      ];
    }),
  }));
  if (manifest.teamFolders.length > 0) {
    groups.push({
      key: "my-teams",
      label: "My teams",
      items: manifest.teamFolders.map((folder) => ({
        key: desktopTeamFolderKey(folder.team),
        label: folder.label,
        icon: drawIcon(teamIcon(folder.team))(ICON),
        ...(folder.lead
          ? { tag: { text: "Lead", spoken: "you lead it" } }
          : {}),
        onSelect: () => onOpenFolder(desktopTeamFolderKey(folder.team)),
      })),
    });
  }

  const footer: StartMenuItem[] = [
    ...(programs.has("account")
      ? [programRow({ ...programs.get("account")!, label: "Account" })]
      : [
          {
            key: "account",
            label: "Account",
            icon: <UserRound aria-hidden className={ICON} />,
            render: ({ onClick, children, ...row }) => (
              <Link href="/profile" {...row} onClick={onClick}>
                {children}
              </Link>
            ),
          } satisfies StartMenuItem,
        ]),
    {
      key: "report",
      label: "Report a problem",
      icon: <Bug aria-hidden className={ICON} />,
      onSelect: () => openReportProblem(),
    },
    {
      key: "line-up",
      label: "Line up icons",
      icon: <LayoutGrid aria-hidden className={ICON} />,
      onSelect: onLineUpIcons,
    },
    {
      key: "show-desktop",
      label: "Show desktop",
      icon: <Minimize2 aria-hidden className={ICON} />,
      onSelect: onShowDesktop,
    },
    {
      key: "log-off",
      label: "Log off",
      icon: <LogOut aria-hidden className={ICON} />,
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
      windows={windows}
      topId={topId}
      onToggleWindow={onToggleWindow}
      startLabel="Start"
      renderStartMenu={({ anchor, onClose }) => (
        <GroupedStartMenu
          groups={groups}
          footer={footer}
          header={
            <p className="flex flex-col text-sm normal-case">
              <span className="font-semibold text-os-fg">{account.name}</span>
              <span className="font-mono text-[11px] text-os-muted">
                {account.rank}
                {leads && ` · ${leads}`}
              </span>
            </p>
          }
          label="Start"
          banner="Camp 404"
          anchor={anchor}
          onClose={onClose}
          landmark="Console"
        />
      )}
      onShowDesktop={onShowDesktop}
      tray={
        <DesktopTray
          tray={manifest.tray}
          pinned={pinned}
          burn={burn}
          onOpenHref={onOpenHref}
        />
      }
    />
  );
}

/** The held desktop's taskbar: the bar and nothing on it. */
export function EmptyTaskbar() {
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 bottom-0 z-[90] h-10 select-none border-t border-os-primary/60 bg-os-chrome"
    />
  );
}
