"use client";

import {
  useContext,
  useEffect,
  useId,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { Route } from "next";
import { refreshTodayAction } from "@/app/(console)/today-actions";
import { MineStar } from "@/components/calendar/calendar-days";
import { EnablePush } from "@/components/push/enable-push";
import type { TodayModel } from "@/lib/today";
import { DesktopSignalsContext } from "./held-screen";
import { LineIcon, type IconKey } from "./line-icons";

// The Today gadget's body, as the approved prototype draws it
// (_proto/bodies/today.tsx): a "TODAY · <date>" strip with what is waiting,
// the countdown to the Burn, then Needs you, Coming up and My tasks, each a
// bordered list of rows that open where they point. The member's own facts
// only (lib/today.ts), rendered on the server with the layout and fetched
// again each time the gadget opens, so it is current on every screen.

type Tone = "warn" | "ok" | "accent" | "muted" | "solid";

const CHIP: Record<Tone, string> = {
  solid: "border-os-primary bg-os-primary text-os-bg",
  ok: "border-os-accent bg-os-accent text-os-bg",
  accent: "border-os-accent/70 bg-os-accent/15 text-os-fg",
  muted: "border-os-line bg-os-fg/5 text-os-muted",
  warn: "border-dashed border-os-primary bg-os-primary/10 text-[color-mix(in_oklch,var(--os-primary)_70%,var(--os-fg))]",
};

/** A square pixel chip ("11 WAITING", "NOW", "DOING"). */
function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center whitespace-nowrap border px-1.5 font-pixel text-[10px] uppercase leading-none tracking-wide ${CHIP[tone]}`}
    >
      {children}
    </span>
  );
}

/** A link that opens its program the desktop's way (like an icon does). */
function DesktopLink({
  href,
  className,
  mine,
  children,
}: {
  href: string;
  className: string;
  /** Marks a row as the member's own team's (data-mine). */
  mine?: boolean;
  children: ReactNode;
}) {
  const desktop = useContext(DesktopSignalsContext);
  function onClick(e: MouseEvent) {
    if (!desktop) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    desktop.open(href);
  }
  return (
    <Link
      href={href as Route}
      onClick={onClick}
      data-mine={mine ? "" : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}

// A row: the skin's 2px magenta ring drawn just inside it on keyboard focus
// (the list's border would hide one outside), and at least 44 px tall on a
// phone, where it is a thumb's target.
const ROW =
  "group flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-os-primary/10 focus-visible:bg-os-primary/10 focus-visible:-outline-offset-2 max-md:min-h-11";

/** Small magenta text, lifted toward the text colour so it reads (6.6:1). */
const URGENT_TEXT =
  "text-[color-mix(in_oklch,var(--os-primary)_70%,var(--os-fg))]";
/** The electric blue lifted the same way, for an icon on the chrome. */
const ACCENT_LIFT =
  "text-[color-mix(in_oklch,var(--os-accent)_65%,var(--os-fg))]";

function Chevron() {
  return (
    <LineIcon
      name="chevron-right"
      className="size-3.5 shrink-0 text-os-muted group-hover:text-os-primary"
    />
  );
}

/** One titled list: a pixel label with its count, then bordered rows. */
function Section({
  label,
  count,
  action,
  empty,
  children,
}: {
  label: string;
  count?: number;
  action?: ReactNode;
  /** Said inside the box when there are no rows. */
  empty?: ReactNode;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3
          id={id}
          className="flex items-center gap-1.5 font-pixel text-[10px] font-normal uppercase tracking-widest text-os-muted"
        >
          {label}
          {count !== undefined && (
            <span aria-hidden className="text-os-fg tabular-nums">
              [{count}]
            </span>
          )}
        </h3>
        {action}
      </div>
      {empty ? (
        <p className="border border-os-line bg-os-bg/40 px-2 py-2 text-sm text-os-muted">
          {empty}
        </p>
      ) : (
        <ul
          aria-labelledby={id}
          className="divide-y divide-os-line border border-os-line bg-os-bg/40"
        >
          {children}
        </ul>
      )}
    </section>
  );
}

function SmallLink({ href, children }: { href: string; children: string }) {
  return (
    <DesktopLink
      href={href}
      className="inline-flex items-center font-pixel text-[10px] uppercase tracking-wider text-[color-mix(in_oklch,var(--os-accent)_65%,var(--os-fg))] hover:text-os-fg hover:underline max-md:min-h-11 max-md:px-1"
    >
      {children}
    </DesktopLink>
  );
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
function day(iso: string): string {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(ms) ? iso : DAY.format(ms);
}

/** The countdown card: the year, its name, and T-n days in big pixels. */
function Countdown({ burn }: { burn: NonNullable<TodayModel["burn"]> }) {
  const big =
    burn.dayOf !== null
      ? { value: `Day ${burn.dayOf}`, unit: "of the Burn" }
      : burn.daysTo !== null
        ? {
            value: `T-${burn.daysTo}`,
            unit: burn.daysTo === 1 ? "day" : "days",
          }
        : null;
  return (
    <DesktopLink
      href="/calendar"
      className="block w-full border border-os-primary/60 bg-os-primary/5 p-2.5 text-left hover:border-os-primary focus-visible:border-os-primary"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-pixel text-[10px] uppercase tracking-widest text-os-muted">
            AfrikaBurn {burn.year}
          </span>
          {burn.name && (
            <span className="block truncate text-xs text-os-muted">
              {burn.name}
            </span>
          )}
        </span>
        {burn.start && <Chip tone="accent">{day(burn.start)}</Chip>}
      </span>
      {big && (
        <span className="os-glow mt-2 block font-pixel text-3xl leading-none text-os-primary tabular-nums">
          {big.value}
          <span className="ml-1.5 text-sm text-os-fg">{big.unit}</span>
        </span>
      )}
      <span className="mt-1.5 block text-xs text-os-muted">
        {burn.start && burn.end
          ? `The Burn runs ${day(burn.start)} to ${day(burn.end)}.`
          : "The Burn's dates are not set yet."}
      </span>
      {/* The year's run-up, last Burn to this one, as the prototype's phone
          draws it: 24 blocks. Not in the desktop's narrow panel (the
          prototype's compact card), only on a phone's Today sheet. */}
      {burn.runUp && <RunUp {...burn.runUp} />}
    </DesktopLink>
  );
}

const RUN_UP_BLOCKS = 24;

/** The run-up bar: blocks filled for the share of the year gone. */
function RunUp({ days, gone }: { days: number; gone: number }) {
  const share = Math.min(Math.max(gone / days, 0), 1);
  const filled = Math.round(share * RUN_UP_BLOCKS);
  return (
    <span data-run-up className="mt-2 block md:hidden">
      <span
        aria-hidden
        className="flex h-2.5 gap-[2px] border border-os-line bg-os-bg p-[2px]"
      >
        {Array.from({ length: RUN_UP_BLOCKS }, (_, i) => (
          <span
            key={i}
            className={`flex-1 ${i < filled ? "bg-os-primary" : "bg-os-fg/10"}`}
          />
        ))}
      </span>
      <span className="sr-only">
        {Math.round(share * 100)}% of the year&rsquo;s run-up gone.
      </span>
    </span>
  );
}

const NEED_ICON: IconKey = "myforms";

const WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});

/**
 * The prototype's date tile on a Coming up row: the weekday over the day of
 * the month, read from the row's camp-day sort key ("2027-04-26T10:00").
 */
function DateTile({ sortKey }: { sortKey: string }) {
  const iso = sortKey.slice(0, 10);
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return (
    <span
      aria-hidden
      className="grid w-11 shrink-0 place-items-center border border-os-line bg-os-chrome py-0.5 text-center"
    >
      <span className="font-pixel text-[9px] uppercase text-os-muted">
        {WEEKDAY.format(ms)}
      </span>
      <span className="font-pixel text-sm leading-none text-os-fg">
        {new Date(ms).getUTCDate()}
      </span>
    </span>
  );
}

/** "Tomorrow · 10:00": the row's relative day, and its time if it has one. */
function upcomingWhen(item: TodayModel["home"]["upcoming"][number]): string {
  const time = item.when.split(" · ")[1];
  return time ? `${item.relative} · ${time}` : item.relative;
}

/**
 * How new the layout's copy must be to skip the read on opening: a copy
 * built for this very page load (the gadget left open, drawn again on a hard
 * load) is current, and a second server round trip would buy nothing.
 */
export const TODAY_FRESH_MS = 5000;

export function TodayBody({ initial }: { initial: TodayModel }) {
  const [model, setModel] = useState(initial);
  // Drawn only while the gadget is open, so this runs on each opening: the
  // layout's copy may be from before the member answered a form or finished
  // a task in a window. Not when that copy was built just now.
  useEffect(() => {
    if (Math.abs(Date.now() - initial.builtAt) < TODAY_FRESH_MS) return;
    let live = true;
    refreshTodayAction().then(
      (fresh) => {
        if (live && fresh) setModel(fresh);
      },
      () => {
        // Keep the copy the page came with.
      },
    );
    return () => {
      live = false;
    };
    // Once per opening, with the copy it opened with.
  }, []);

  const { home, date, burn } = model;
  const waiting = home.todos.length;
  const calendarNote =
    home.calendarState === "not_configured"
      ? "The camp calendar isn't connected yet."
      : home.calendarState === "unavailable"
        ? "Couldn't reach the camp calendar just now."
        : null;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="sticky top-0 z-10 flex h-8 shrink-0 items-center justify-between gap-2 border-b border-os-line bg-os-chrome pl-2.5 pr-1">
        <h2 className="flex min-w-0 items-center gap-1.5 truncate font-pixel text-[10px] font-normal uppercase tracking-widest text-os-fg">
          <LineIcon
            name="today"
            className={`size-3.5 shrink-0 ${ACCENT_LIFT}`}
          />
          Today · {date}
        </h2>
        {!home.waitingForApproval && (
          <Chip tone={waiting > 0 ? "warn" : "ok"}>
            {waiting > 0 ? `${waiting} waiting` : "All clear"}
          </Chip>
        )}
      </div>

      <div className="grid gap-3 p-2.5">
        {burn && <Countdown burn={burn} />}

        {home.waitingForApproval ? (
          <div className="flex items-start gap-2 border border-os-accent/60 bg-os-accent/10 p-2.5">
            <LineIcon
              name="clock"
              className="mt-0.5 size-4 shrink-0 text-os-accent"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-os-fg">
                Waiting for a captain
              </p>
              <p className="text-xs text-os-muted">
                Your bio is in. You&rsquo;ll get a notice here when you&rsquo;re
                approved. Nothing else to do for now.
              </p>
            </div>
          </div>
        ) : (
          <>
            <Section
              label="Needs you"
              count={waiting}
              empty={waiting === 0 ? "Nothing waiting on you." : undefined}
            >
              {home.todos.map((todo) => (
                <li key={todo.id}>
                  <DesktopLink
                    href={todo.href}
                    className={`${ROW} ${todo.urgent ? "shadow-[inset_2px_0_0_0_var(--os-primary)]" : ""}`}
                  >
                    <LineIcon
                      name={NEED_ICON}
                      className="size-4 shrink-0 text-os-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-os-fg">
                        {todo.label}
                      </span>
                      {todo.due && (
                        <span
                          className={`block truncate font-mono text-xs ${todo.urgent ? URGENT_TEXT : "text-os-muted"}`}
                        >
                          {todo.due}
                        </span>
                      )}
                    </span>
                    {todo.urgent && <Chip tone="solid">Now</Chip>}
                    <Chevron />
                  </DesktopLink>
                </li>
              ))}
            </Section>

            <Section
              label="Coming up"
              action={<SmallLink href="/calendar">Calendar</SmallLink>}
              empty={
                home.upcoming.length === 0
                  ? (calendarNote ?? "Nothing on the calendar yet.")
                  : undefined
              }
            >
              {home.upcoming.map((item) => (
                <li key={item.id}>
                  {/* One of your teams' events: a blue rule and a star. */}
                  <DesktopLink
                    href="/calendar"
                    mine={!!item.team?.mine}
                    className={`${ROW} ${item.team?.mine ? "shadow-[inset_2px_0_0_0_var(--os-accent)]" : ""}`}
                  >
                    <DateTile sortKey={item.sortKey} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <LineIcon
                          name={item.kind === "travel" ? "lift" : "calendar"}
                          className="size-3.5 shrink-0 text-os-accent"
                        />
                        <span className="truncate text-os-fg">
                          {item.team?.mine ? <MineStar /> : null}
                          {item.title}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-os-muted">
                        <span className="font-mono">{upcomingWhen(item)}</span>
                        {item.location ? ` · ${item.location}` : null}
                      </span>
                    </span>
                    {item.team && <Chip tone="muted">{item.team.label}</Chip>}
                    <Chevron />
                  </DesktopLink>
                </li>
              ))}
            </Section>
            {home.upcoming.length > 0 && calendarNote && (
              <p className="-mt-2 text-xs text-os-muted">{calendarNote}</p>
            )}

            <Section
              label="My tasks"
              count={home.tasks.length + home.tasksMore}
              empty={
                home.tasks.length === 0 ? "No open tasks. Nice." : undefined
              }
              action={
                <SmallLink href="/tasks">
                  {home.tasksMore > 0
                    ? `All tasks (+${home.tasksMore})`
                    : "All tasks"}
                </SmallLink>
              }
            >
              {home.tasks.map((task) => (
                <li key={task.id}>
                  <DesktopLink href={task.href} className={ROW}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-os-fg">
                        {task.label}
                      </span>
                      <span
                        className={`block truncate font-mono text-xs ${task.urgent ? URGENT_TEXT : "text-os-muted"}`}
                      >
                        {task.due ?? "No date"}
                      </span>
                    </span>
                    {task.doing && <Chip tone="accent">Doing</Chip>}
                    <Chevron />
                  </DesktopLink>
                </li>
              ))}
            </Section>

            {home.lift && (
              <Section label={home.lift.heading}>
                {home.lift.lines.map((line) => (
                  <li key={line} className="px-2 py-1.5 text-sm text-os-fg">
                    {line}
                  </li>
                ))}
              </Section>
            )}
          </>
        )}

        {!home.allDone && (
          <Section label="Your setup">
            {home.checklist.map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-2 px-2 py-1.5 text-sm"
              >
                <span
                  aria-hidden
                  className={`grid size-4 shrink-0 place-items-center border ${
                    item.done
                      ? "border-os-accent bg-os-accent text-os-bg"
                      : "border-os-muted/70"
                  }`}
                >
                  {item.done && <LineIcon name="check" className="size-3" />}
                </span>
                <span className={item.done ? "text-os-fg" : "text-os-muted"}>
                  {item.label}
                </span>
                <span className="sr-only">
                  {item.done ? "done" : "not yet"}
                </span>
                {item.label === "Sign-in secured" && !item.done && (
                  <DesktopLink
                    href="/profile/security"
                    className="ml-auto inline-flex items-center font-pixel text-[10px] uppercase tracking-wider text-[color-mix(in_oklch,var(--os-accent)_65%,var(--os-fg))] hover:underline max-md:min-h-11 max-md:px-1"
                  >
                    Secure it
                  </DesktopLink>
                )}
              </li>
            ))}
          </Section>
        )}

        {/* Web push opt-in; renders nothing unless push is supported and
            the member has not decided yet. */}
        <EnablePush />
      </div>
    </div>
  );
}
