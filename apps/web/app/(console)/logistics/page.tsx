import Link from "next/link";
import type * as React from "react";
import {
  CalendarDays,
  CalendarX,
  ChevronRight,
  MapPin,
  Pencil,
} from "lucide-react";
import {
  attendanceIsOpen,
  campDayKey,
  canAskForAttendance,
  canEditLogistics,
} from "@camp404/core";
import {
  ATTENDANCE_ANSWERS,
  ATTENDANCE_ANSWER_LABELS,
  LOGISTICS_PHASES,
  LOGISTICS_PHASE_HINTS,
  LOGISTICS_PHASE_LABELS,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { EditorsNote } from "@camp404/ui/components/field-list";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { RowActions } from "@camp404/ui/components/row-actions";
import { AskAttendance } from "@/components/logistics/ask-attendance";
import { AttendancePicker } from "@/components/logistics/attendance-picker";
import { PhaseEditButton } from "@/components/logistics/phase-editor";
import { getCurrentCycle } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getAttendanceView,
  isAskedForAttendance,
  isLogisticsCalendarConnected,
  listDeadlines,
  listLogisticsPhases,
  type AttendanceView,
  type DeadlineRow,
  type LogisticsPhaseRow,
} from "@/lib/logistics";
import {
  CALENDAR_NOT_CONNECTED_NOTE,
  DEADLINES_SETTINGS_HREF,
  deadlineDateText,
  LOGISTICS_EDITORS_NOTE,
  phaseLengthText,
  phaseRangeText,
} from "@/lib/logistics-copy";
import { ledgerCycle } from "@/lib/payments";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Logistics — Camp 404" };

/** Who can help's own anchor, for the asked member's "Answer now". */
const WHO_CAN_HELP_ID = "who-can-help";

// The logistics calendar (#247): the year's pack, travel, build, burn, strike
// and unpack days, in the order the camp lives them. Every approved member
// reads it; a captain or a Transport and Logistics lead sets the days. Each
// phase with days is one event on the camp's shared Google Calendar (owner,
// 2026-09-28: the calendar stays on Google), so it shows on the Calendar, on
// Home's "Coming up" too, as a whole-camp event with a plain title. Composed
// as the load list: one card of rows, Edit per row opening a dialog. A reader
// sees the days as content, with no Edit at all and one quiet line saying who
// sets them (AGENTS.md, "read-only is content").
//
// "Who can help" (owner, 2026-09-30: "a standard attendance thing that the
// whole camp must be involved"): for Pack, Build, Strike and Unpack, every
// member answers Going, Maybe or Can't for themselves until the phase starts,
// and reads everyone's answers by name. Who has NOT answered is the list of
// members who are coming, and whether someone is coming reads at team lead,
// so a plain member sees how many, and leads and captains see who. While the
// viewer still has a day to answer, Who can help comes first: answering is
// their job, the dates are reference. A captain's "Ask who can help" nudges
// them, as the gear rental's does, and an asked member is told at the top.
// Then the year's AfrikaBurn deadlines, read-only here; captains keep them on
// the camp's year page.

type CalendarState = "pending" | "lingering";

/**
 * Where a phase stands on the camp calendar, when that is worth a word. Being
 * on it is the normal case and the page description already says so; only a
 * phase that did not get there, or did not come off, says anything.
 */
function calendarState(
  row: LogisticsPhaseRow | undefined,
  connected: boolean,
): CalendarState | null {
  if (!connected || !row) return null;
  if (row.startDate === null) {
    // Cleared: only worth a word while its event may still be there.
    return row.calendarEventId && row.calendarSyncedVersion !== row.version
      ? "lingering"
      : null;
  }
  return row.calendarSyncedVersion === row.version ? null : "pending";
}

function CalendarChip({ state }: { state: CalendarState }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-warning">
      <CalendarX className="h-3.5 w-3.5" aria-hidden />
      {state === "lingering"
        ? "Still on the camp calendar. Clear the days again to take it off."
        : "Not on the camp calendar yet. Save again to retry."}
    </span>
  );
}

/** A section's card head: the pixel title, one line, and its action. */
function SectionHead({
  id,
  title,
  description,
  action,
}: {
  id?: string;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-4 page-sm:flex-row page-sm:items-start page-sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** A note in the window's blue card tint (never the warning brown). */
function Note({ children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm page-sm:flex-row page-sm:items-center page-sm:justify-between"
      {...props}
    >
      {children}
    </div>
  );
}

function Days({
  byPhase,
  connected,
  canEdit,
  burnDates,
}: {
  byPhase: Map<string, LogisticsPhaseRow>;
  connected: boolean;
  canEdit: boolean;
  burnDates: { startDate: string; endDate: string } | null;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <SectionHead
          title="The days"
          description={
            canEdit ? (
              "Edit a day to set its dates, place and note. Saving puts it on the camp calendar."
            ) : (
              <EditorsNote className="text-sm">
                {LOGISTICS_EDITORS_NOTE}
              </EditorsNote>
            )
          }
        />
        <ol
          aria-label="Logistics days"
          className="divide-y divide-border border-t border-border"
        >
          {LOGISTICS_PHASES.map((phase, index) => {
            const row = byPhase.get(phase);
            const label = LOGISTICS_PHASE_LABELS[phase];
            const state = calendarState(row, connected);
            const start = row?.startDate ?? null;
            const end = row?.endDate ?? null;
            const details = [row?.place, row?.note].filter(Boolean);
            return (
              <li
                key={phase}
                aria-label={label}
                className="flex items-start gap-3 px-4 py-3"
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/50 text-xs font-semibold text-accent"
                >
                  {index + 1}
                </span>
                <div className="grid min-w-0 flex-1 gap-x-4 gap-y-1 page-sm:grid-cols-[minmax(0,1fr)_15rem]">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h3 className="text-sm font-semibold">{label}</h3>
                    <p className="text-xs text-muted-foreground">
                      {LOGISTICS_PHASE_HINTS[phase]}
                    </p>
                  </div>
                  <p className="text-sm page-sm:text-right">
                    {start && end ? (
                      <>
                        <span className="tabular-nums">
                          {phaseRangeText(start, end)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {phaseLengthText(start, end)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Days not set yet.
                      </span>
                    )}
                  </p>
                  {details.length > 0 && (
                    <p className="flex items-start gap-1 text-xs whitespace-pre-line text-muted-foreground page-sm:col-span-2">
                      {row?.place && (
                        <MapPin
                          className="mt-px h-3.5 w-3.5 shrink-0"
                          aria-label="Place"
                        />
                      )}
                      <span>{details.join(" · ")}</span>
                    </p>
                  )}
                  {state && (
                    <div className="page-sm:col-span-2">
                      <CalendarChip state={state} />
                    </div>
                  )}
                </div>
                {canEdit && (
                  <RowActions
                    className="shrink-0"
                    primary={
                      <PhaseEditButton
                        key={`${phase}:${row?.version ?? 0}`}
                        phase={{
                          phase,
                          startDate: row?.startDate ?? null,
                          endDate: row?.endDate ?? null,
                          place: row?.place ?? null,
                          note: row?.note ?? null,
                          version: row?.version ?? 0,
                          onCalendar: Boolean(row?.calendarEventId),
                        }}
                        suggestion={phase === "burn" ? burnDates : null}
                      />
                    }
                  />
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

/** One answer's names, as chips that never break mid-name. */
function NameGroup({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">
        {label} ({names.length})
      </dt>
      <dd>
        <ul className="flex flex-wrap gap-1.5">
          {names.map((name, i) => (
            <li
              key={`${name}-${i}`}
              className="rounded-sm border border-border px-2 py-0.5 text-xs whitespace-nowrap"
            >
              {name}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

function WhoCanHelp({
  view,
  rows,
  today,
}: {
  view: AttendanceView;
  rows: Map<string, LogisticsPhaseRow>;
  today: string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <SectionHead
          id={WHO_CAN_HELP_ID}
          title="Who can help"
          description="Packing, building, striking and unpacking need the whole camp. Say Going, Maybe or Can't for each. You can change your answer until the day starts."
        />
        <ul
          aria-label="Who can help"
          className="divide-y divide-border border-t border-border"
        >
          {view.phases.map((board) => {
            const label = LOGISTICS_PHASE_LABELS[board.phase];
            const row = rows.get(board.phase);
            const notAnswered = view.notAnsweredCount[board.phase];
            const answered = ATTENDANCE_ANSWERS.some(
              (a) => board.names[a].length > 0,
            );
            return (
              <li
                key={board.phase}
                aria-label={`Who can help: ${label}`}
                className="grid gap-4 px-4 py-4 page-md:grid-cols-[14rem_minmax(0,1fr)]"
              >
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-sm font-semibold">{label}</h3>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {row?.startDate && row.endDate ? (
                      <>
                        <span className="block">
                          {phaseRangeText(row.startDate, row.endDate)}
                        </span>
                        {phaseLengthText(row.startDate, row.endDate)}
                      </>
                    ) : (
                      "Days not set yet."
                    )}
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                  <AttendancePicker
                    key={`${board.phase}:${view.mine[board.phase] ?? "none"}`}
                    phase={board.phase}
                    answer={view.mine[board.phase] ?? null}
                    open={attendanceIsOpen(row?.startDate, today)}
                  />
                  <dl
                    className="flex flex-col gap-3"
                    data-testid={`attendance-names-${board.phase}`}
                  >
                    {ATTENDANCE_ANSWERS.map((a) => (
                      <NameGroup
                        key={a}
                        label={ATTENDANCE_ANSWER_LABELS[a]}
                        names={board.names[a]}
                      />
                    ))}
                    {view.namesWhoHaveNotAnswered && (
                      <NameGroup
                        label="Not answered"
                        names={board.notAnswered}
                      />
                    )}
                  </dl>
                  {(!answered || !view.namesWhoHaveNotAnswered) && (
                    <p
                      className="-mt-2 text-xs text-muted-foreground tabular-nums"
                      data-testid={`attendance-counts-${board.phase}`}
                    >
                      {!answered ? "Nobody has answered yet. " : ""}
                      {!view.namesWhoHaveNotAnswered && notAnswered > 0
                        ? `${notAnswered} not answered.`
                        : ""}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function DeadlineItem({ d }: { d: DeadlineRow }) {
  return (
    <li
      aria-label={d.title}
      className="grid gap-x-4 gap-y-0.5 px-4 py-3 page-sm:grid-cols-[minmax(0,1fr)_11rem]"
    >
      <h3
        className={
          d.done
            ? "text-sm font-semibold text-muted-foreground"
            : "text-sm font-semibold"
        }
      >
        {d.title}
      </h3>
      <p className="text-sm tabular-nums text-muted-foreground page-sm:row-span-2 page-sm:text-right">
        {d.dueDate ? deadlineDateText(d.dueDate) : "Date not known yet"}
      </p>
      {d.note && (
        <p className="whitespace-pre-line text-sm text-muted-foreground">
          {d.note}
        </p>
      )}
    </li>
  );
}

function Deadlines({
  deadlines,
  canManage,
}: {
  deadlines: DeadlineRow[];
  canManage: boolean;
}) {
  // Open ones first, in date order; done ones fold away at the end.
  const open = deadlines.filter((d) => !d.done);
  const done = deadlines.filter((d) => d.done);
  return (
    <Card>
      <CardContent className="p-0">
        <SectionHead
          title="AfrikaBurn deadlines"
          description="The dates AfrikaBurn sets for the camp. The ones with a date are on the camp calendar too."
          action={
            canManage ? (
              <Button asChild variant="outline" size="sm">
                <Link href={DEADLINES_SETTINGS_HREF}>
                  <Pencil aria-hidden />
                  Edit deadlines
                </Link>
              </Button>
            ) : undefined
          }
        />
        {deadlines.length === 0 ? (
          <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
            No deadlines yet. The captains add them as AfrikaBurn publishes
            them.
          </p>
        ) : (
          <>
            {open.length > 0 && (
              <ol
                aria-label="AfrikaBurn deadlines"
                className="divide-y divide-border border-t border-border"
              >
                {open.map((d) => (
                  <DeadlineItem key={d.id} d={d} />
                ))}
              </ol>
            )}
            {done.length > 0 && (
              <details className="group border-t border-border">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    aria-hidden
                    className="h-4 w-4 transition-transform group-open:rotate-90"
                  />
                  Done ({done.length})
                </summary>
                <ol
                  aria-label="Done AfrikaBurn deadlines"
                  className="divide-y divide-border border-t border-border"
                >
                  {done.map((d) => (
                    <DeadlineItem key={d.id} d={d} />
                  ))}
                </ol>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default async function LogisticsPage() {
  // Every approved member reads the days.
  const { campUser, rank } = await captainPageGate("camp_member");
  const [leadTeams, rows, cycle, year, deadlines, asked] = await Promise.all([
    rank === "team_lead" ? getLeadTeams(campUser.id) : Promise.resolve([]),
    listLogisticsPhases(),
    getCurrentCycle(),
    ledgerCycle(),
    listDeadlines(),
    isAskedForAttendance(campUser.id),
  ]);
  const attendance = await getAttendanceView({
    userId: campUser.id,
    rank,
    cycle: year,
  });
  const canEdit = canEditLogistics(rank, leadTeams);
  const canAsk = canAskForAttendance(rank);
  const today = campDayKey(new Date());
  const connected = isLogisticsCalendarConnected();
  const byPhase = new Map(rows.map((r) => [r.phase, r]));
  // The Burn's own dates, from Camp settings, start the Burn's editor off.
  const burnDates =
    cycle?.burnStart && cycle.burnEnd
      ? { startDate: cycle.burnStart, endDate: cycle.burnEnd }
      : null;
  // A day the viewer can still answer and has not: then answering comes first.
  const toAnswer = attendance.phases.some(
    (b) =>
      attendance.mine[b.phase] === undefined &&
      attendanceIsOpen(byPhase.get(b.phase)?.startDate, today),
  );

  const days = (
    <Days
      byPhase={byPhase}
      connected={connected}
      canEdit={canEdit}
      burnDates={burnDates}
    />
  );
  const help = <WhoCanHelp view={attendance} rows={byPhase} today={today} />;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Transport and Logistics"
        title="Logistics"
        description="The year's big days, from packing at the storage unit to unpacking there again. Each one is on the camp calendar too."
        actions={
          <div className="flex flex-col items-start gap-2 page-sm:items-end">
            {canAsk && <AskAttendance />}
            <Button asChild variant="link" className="h-auto px-0">
              <Link href="/calendar">
                <CalendarDays aria-hidden />
                Open the calendar
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        {!connected && (
          <Note>
            <p className="text-muted-foreground">
              {CALENDAR_NOT_CONNECTED_NOTE}
            </p>
          </Note>
        )}
        {asked && (
          <Note role="status" data-testid="attendance-asked">
            <p>
              The captains asked who can help on the big days. Answer each day
              in Who can help.
            </p>
            <Button asChild size="sm" className="shrink-0 self-start">
              <a href={`#${WHO_CAN_HELP_ID}`}>Answer now</a>
            </Button>
          </Note>
        )}
        {toAnswer ? help : days}
        {toAnswer ? days : help}
        <Deadlines deadlines={deadlines} canManage={rank === "captain"} />
      </div>
    </div>
  );
}
