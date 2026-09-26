"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import {
  GlitchWordmark,
  iconName,
  useMinuteClock,
  type DesktopIconItem,
} from "@camp404/os";
import { burnCountdownLabel } from "@/lib/burn-countdown";
import { SignOutLink } from "@/components/auth/sign-out-link";
import { openReportProblem } from "@/components/feedback/report-problem";
import { LineIcon } from "./line-icons";

// The phone's Classic desktop (below md; design doc, section 5; visual
// language doc, section 9). Drawn by CSS, not by a screen check: every piece
// here is `md:hidden`, and the desktop's pieces are `max-md:hidden`, so the
// server's first paint is already right at 390 px and nothing flips after
// hydration.
//
//  - the home screen: the same groups as the desktop (Me, Camp, Captains,
//    with the Terminal), rows of big icons, then a My teams row of team
//    folders. A fixed order: no dragging, no right-click menu, and the
//    member's own folders and shortcuts are not here (desktop only);
//  - the bottom bar, in place of the taskbar: Home, Open programs, the inbox
//    bell and Today;
//  - sheets over the home screen: the open-programs list and Today.

/** One group of the home screen: its name and its icons, in order. */
export interface PhoneGroup {
  key: string;
  label: string;
  items: PhoneIcon[];
}

export interface PhoneIcon extends DesktopIconItem {
  onOpen: () => void;
}

/** A quiet group label with a hairline, above a grid of icons (the prototype's). */
function GroupLabel({ children }: { children: string }) {
  return (
    <h2 className="mb-1.5 flex items-center gap-2 px-1 font-mono text-[10px] font-normal uppercase tracking-[0.3em] text-os-muted">
      {children}
      <span aria-hidden className="h-px flex-1 bg-os-line/60" />
    </h2>
  );
}

/** The home screen: `/` on a phone. */
export function PhoneHome({
  groups,
  notices,
  tagline,
  covered = false,
}: {
  groups: readonly PhoneGroup[];
  /** Under the wordmark: "AfrikaBurn 2027 · The Big Question". */
  tagline?: string | null;
  /** Lines above the icons: the pending applicant's note, system health. */
  notices?: ReactNode;
  /**
   * A program or sheet covers it whole: out of the Tab order and the
   * accessibility tree (`inert`), so both see one live window. Only ever
   * shown below md, so the flag changes nothing on a desktop.
   */
  covered?: boolean;
}) {
  return (
    <div
      data-os-phone-home
      inert={covered || undefined}
      className="absolute inset-0 select-none overflow-y-auto overscroll-contain md:hidden"
    >
      {/* The wordmark, as the prototype's phone draws it; a short phone
          skips it (the header already says Camp 404) so the groups fit. */}
      <div
        data-os-paused={covered || undefined}
        className="pointer-events-none relative flex flex-col items-center gap-1.5 pt-5 [@media(max-height:700px)]:hidden"
      >
        <GlitchWordmark text="404" size="clamp(3.25rem, 20vw, 5rem)" />
        {tagline && (
          <p
            aria-hidden
            data-label={tagline}
            className="os-chromatic px-4 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-os-fg after:content-[attr(data-label)]"
          />
        )}
      </div>
      <div className="relative mx-auto flex max-w-md flex-col gap-5 px-3 pb-6 pt-5">
        {notices}
        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <nav key={group.key} aria-label={group.label}>
              <GroupLabel>{group.label}</GroupLabel>
              <ul className="grid grid-cols-3 gap-x-1 gap-y-2 min-[380px]:grid-cols-4">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <PhoneIconButton item={item} />
                  </li>
                ))}
              </ul>
            </nav>
          ),
        )}
        <PhoneFoot />
      </div>
    </div>
  );
}

/** A big icon: at least 48 px of picture, the whole cell a 64 x 80 target. */
function PhoneIconButton({ item }: { item: PhoneIcon }) {
  return (
    <button
      type="button"
      data-phone-icon={item.key}
      onClick={item.onOpen}
      aria-label={iconName(item)}
      className={`group relative flex min-h-20 w-full min-w-16 flex-col items-center gap-1.5 px-0.5 py-1.5 text-os-accent outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-os-primary ${
        item.pending ? "os-pending" : ""
      }`}
    >
      <span aria-hidden className="relative">
        {item.icon(
          `size-11 ${item.open ? "text-os-primary drop-shadow-[0_0_8px_var(--os-primary)]" : ""}`,
        )}
        {item.badge ? (
          <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center bg-os-primary px-0.5 font-mono text-[10px] font-bold leading-none text-os-bg">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
        {item.lead && (
          <span className="absolute -left-4 -top-1.5 border border-os-primary bg-os-bg px-0.5 font-pixel text-[8px] uppercase leading-tight text-os-fg">
            Lead
          </span>
        )}
      </span>
      {/* Drawn by CSS, as on the desktop, so an icon's name never collides
          with the same words in a page; the button's name is its label. */}
      <span
        aria-hidden
        data-label={item.label}
        className={`line-clamp-2 max-w-full px-1 py-0.5 text-center font-pixel text-[10px] uppercase leading-tight after:content-[attr(data-label)] ${
          item.open ? "bg-os-primary text-os-bg" : "bg-os-chrome/80 text-os-fg"
        }`}
      />
    </button>
  );
}

/** The Start menu's foot, on a phone: Report a problem and Log off. */
function PhoneFoot() {
  const row =
    "flex min-h-11 items-center gap-2 whitespace-nowrap border border-os-line bg-os-panel px-3 font-pixel text-[10px] uppercase text-os-fg";
  return (
    <div className="grid grid-cols-2 gap-2 pt-2">
      <button type="button" className={row} onClick={() => openReportProblem()}>
        <LineIcon name="alert" className="size-4" />
        Report a problem
      </button>
      {/* Never a plain /auth/sign-out link: SignOutLink removes this
          device's push token and the desktop's windows first. */}
      <SignOutLink className={row}>
        <LineIcon name="logoff" className="size-4" />
        Log off
      </SignOutLink>
    </div>
  );
}

/** The bottom bar: Home, Open programs, the inbox bell, Today and the clock. */
export function PhoneBar({
  hidden,
  openCount,
  switcherOpen,
  todayOpen,
  todayCount,
  onHome,
  onSwitcher,
  onToday,
  bell,
  clock,
}: {
  /** The soft keyboard is up: nothing fixed rides over the field. */
  hidden: boolean;
  openCount: number;
  switcherOpen: boolean;
  todayOpen: boolean;
  /** Things due today, when the page said. */
  todayCount?: number;
  onHome: () => void;
  onSwitcher: () => void;
  onToday: () => void;
  /** The inbox bell, as the tray draws it. */
  bell: ReactNode;
  /** The clock cell's contents (the time, the days to the Burn). */
  clock?: ReactNode;
}) {
  // The prototype's cells: bordered, pixel labels, the one that is open in
  // magenta.
  const cell =
    "relative flex h-12 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 border font-pixel text-[10px] uppercase outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-os-fg";
  const idle = "border-os-line bg-os-panel text-os-fg";
  const on = "border-os-primary bg-os-primary text-os-bg";
  return (
    <div
      role="toolbar"
      aria-label="Bottom bar"
      hidden={hidden}
      data-os-phone-bar
      className="fixed inset-x-0 bottom-0 z-[90] flex select-none items-center gap-1 border-t border-os-primary/60 bg-os-chrome px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <button
        type="button"
        onClick={onHome}
        className={`${cell} ${idle}`}
        aria-label="Home"
      >
        <span aria-hidden className="os-chromatic text-xs">
          404
        </span>
        Home
      </button>
      <button
        type="button"
        onClick={onSwitcher}
        aria-expanded={switcherOpen}
        aria-label={`Open programs, ${openCount}`}
        className={`${cell} ${switcherOpen ? on : idle}`}
      >
        <span
          aria-hidden
          className="grid h-4 min-w-5 place-items-center border border-current px-0.5 font-mono text-[11px] leading-none"
        >
          {openCount}
        </span>
        Programs
      </button>
      <div className="flex h-12 min-w-11 flex-1 items-center justify-center border border-os-line bg-os-panel">
        {bell}
      </div>
      <button
        type="button"
        onClick={onToday}
        aria-expanded={todayOpen}
        aria-label={todayCount ? `Today, ${todayCount} due` : "Today"}
        className={`${cell} ${todayOpen ? on : idle}`}
      >
        <LineIcon name="today" className="size-4" />
        Today
        {!todayOpen && todayCount ? (
          <span
            aria-hidden
            className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center bg-os-primary px-0.5 font-mono text-[10px] font-bold leading-none text-os-bg"
          >
            {todayCount > 99 ? "99+" : todayCount}
          </span>
        ) : null}
      </button>
      {clock && <div className="relative min-w-0 flex-1">{clock}</div>}
    </div>
  );
}

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: CAMP_TIME_ZONE,
});

/**
 * The bottom bar's clock cell: the time in camp time and the days to the
 * Burn under it. Its own component, so the minute's tick re-renders it and
 * nothing else; blank until mounted, so the server's paint agrees.
 */
export function PhoneClock({
  burn,
  decoration,
}: {
  burn: { start: string; end: string } | null;
  /** Drawn over the clock's top edge (Prince, asleep on it). */
  decoration?: ReactNode;
}) {
  const now = useMinuteClock();
  const days = now ? burnCountdownLabel(now, burn) : null;
  return (
    <>
      {decoration}
      <time
        dateTime={now?.toISOString()}
        className="flex h-12 flex-col items-center justify-center border border-os-line bg-os-bg font-mono leading-none text-os-fg"
      >
        <span className="text-[13px]">{now ? CLOCK.format(now) : ""}</span>
        {days && (
          <span className="mt-0.5 text-[9px] uppercase text-os-muted">
            {days.replace(" to the Burn", "")}
          </span>
        )}
      </time>
    </>
  );
}

/**
 * A sheet over the home screen, above the bottom bar: a title bar with a
 * big Back and the name, then its body, scrolling on its own. It fills the
 * screen above the bar (Today, the open-programs list), as the prototype's.
 */
export function PhoneSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <section
      ref={ref}
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          onClose();
        }
      }}
      className="os-window-in fixed inset-x-0 top-0 bottom-[var(--os-phone-bar,0px)] z-[85] flex flex-col border-t border-os-primary bg-os-panel outline-none md:hidden"
    >
      <div className="flex h-12 shrink-0 select-none items-center gap-2 border-b border-os-primary bg-os-primary pr-1 text-os-primary-fg">
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="flex h-12 min-w-11 shrink-0 items-center gap-1 pl-2 pr-3 font-pixel text-xs uppercase hover:bg-os-bg/30"
        >
          <LineIcon name="chevron-left" className="size-5" />
          Back
        </button>
        <span className="min-w-0 flex-1 truncate text-center font-pixel text-sm uppercase tracking-[0.15em]">
          {title}
        </span>
        <span aria-hidden className="w-[4.75rem] shrink-0" />
      </div>
      <div className="min-h-0 flex-1 select-text overflow-y-auto overscroll-contain">
        {children}
      </div>
    </section>
  );
}

/** One open window in the open-programs list. */
export interface SwitcherRow {
  id: string;
  label: string;
  icon: ReactNode;
  /** It is the one on screen now. */
  current: boolean;
}

/** The open-programs list: each window by its plain name, to go to or close. */
export function PhoneSwitcher({
  rows,
  onPick,
  onCloseWindow,
}: {
  rows: readonly SwitcherRow[];
  onPick: (id: string) => void;
  onCloseWindow: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="p-5 text-sm text-os-muted">
        Nothing is open. Programs you open stay here until you close them.
      </p>
    );
  }
  return (
    <div className="p-3">
      <ul
        aria-label="Open programs"
        className="flex flex-col divide-y divide-os-line border border-os-line bg-os-bg/60"
      >
        {rows.map((row) => (
          <li key={row.id} className="flex items-stretch">
            <button
              type="button"
              onClick={() => onPick(row.id)}
              aria-current={row.current || undefined}
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 text-left text-os-accent hover:bg-os-primary/15"
            >
              {row.icon}
              <span className="truncate font-pixel text-xs uppercase text-os-fg">
                {row.label}
              </span>
              {row.current && (
                <span className="ml-auto shrink-0 font-mono text-[10px] uppercase text-os-muted">
                  On screen
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onCloseWindow(row.id)}
              aria-label={`Close ${row.label}`}
              className="grid w-14 shrink-0 place-items-center text-xl text-os-muted hover:text-os-primary"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
