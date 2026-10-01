import Link from "next/link";
import {
  CalendarDays,
  CalendarCheck,
  CalendarX,
  Lock,
  MapPin,
} from "lucide-react";
import {
  AFRIKABURN_DATE_GROUPS,
  AFRIKABURN_DATES,
  AFRIKABURN_OTHER_GROUP_LABEL,
  NO_ROUND_THIS_YEAR,
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
import { PageHeading } from "@camp404/ui/components/page-heading";
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
  deadlineDateText,
  LOGISTICS_REFUSAL,
  NOT_ANNOUNCED_YET,
  phaseDaysText,
  YEAR_SETTINGS_PATH,
} from "@/lib/logistics-copy";
import { ledgerCycle } from "@/lib/payments";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Logistics — Camp 404" };

// The logistics calendar (#247): the year's pack, travel, build, burn, strike
// and unpack days, in the order the camp lives them. Every approved member
// reads it; a captain or a Transport and Logistics lead sets the days. Each
// phase with days is one event on the camp's shared Google Calendar (owner,
// 2026-09-28: the calendar stays on Google), so it shows on the Calendar, on
// Home's "Coming up" too, as a whole-camp event with a plain title. Composed
// as the load list: one card of rows, Edit per row opening a dialog, and for
// everyone else the Edit buttons PRESENT BUT DISABLED with one Lock line that
// each describes to.
//
// Below it, "Who can help" (owner, 2026-09-30: "a standard attendance thing
// that the whole camp must be involved"): for Pack, Build, Strike and Unpack,
// every member answers Going, Maybe or Can't for themselves until the phase
// starts, and reads everyone's answers by name. Who has NOT answered is the
// list of members who are coming, and whether someone is coming reads at
// team lead, so a plain member sees how many, and leads and captains see who.
// A captain's "Ask everyone" nudges them, as the gear rental's does. Then the
// year's AfrikaBurn dates, read-only here and grouped as on the camp's year
// page, where captains keep them; only the ones a captain has set show.

const REFUSAL_ID = "logistics-edit-refusal";

type CalendarState = "on" | "pending" | "lingering";

/** Where a phase stands on the camp calendar, for the chip beside it. */
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
  return row.calendarSyncedVersion === row.version ? "on" : "pending";
}

function CalendarChip({ state }: { state: CalendarState }) {
  if (state === "on") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CalendarCheck className="h-3.5 w-3.5 text-success" aria-hidden />
        On the camp calendar
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-warning">
      <CalendarX className="h-3.5 w-3.5" aria-hidden />
      {state === "lingering"
        ? "Still on the camp calendar. Clear the days again to take it off."
        : "Not on the camp calendar yet. Save again to retry."}
    </span>
  );
}

/** "3 going · 1 maybe · 2 can't" for a phase, with the unanswered count. */
function countsText(
  board: AttendanceView["phases"][number],
  notAnswered: number,
): string {
  const parts = ATTENDANCE_ANSWERS.map(
    (a) =>
      `${board.names[a].length} ${ATTENDANCE_ANSWER_LABELS[a].toLowerCase()}`,
  );
  if (notAnswered > 0) parts.push(`${notAnswered} not answered`);
  return parts.join(" · ");
}

function NameLine({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5 page-sm:flex-row page-sm:gap-2">
      <dt className="shrink-0 text-xs font-medium text-muted-foreground page-sm:w-28">
        {label} ({names.length})
      </dt>
      <dd className="text-sm">{names.join(", ")}</dd>
    </div>
  );
}

function WhoCanHelp({
  view,
  rows,
  today,
  asked,
}: {
  view: AttendanceView;
  rows: Map<string, LogisticsPhaseRow>;
  today: string;
  asked: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Who can help</h2>
          <p className="text-sm text-muted-foreground">
            Packing, building, striking and unpacking need the whole camp. Say
            Going, Maybe or Can&apos;t for each. You can change your answer
            until the day starts.
          </p>
        </div>
        {asked && (
          <p
            role="status"
            data-testid="attendance-asked"
            className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          >
            The captains asked everyone who is coming. Answer each day below.
          </p>
        )}
        <ul
          aria-label="Who can help"
          className="grid gap-3 page-md:grid-cols-2"
        >
          {view.phases.map((board) => {
            const label = LOGISTICS_PHASE_LABELS[board.phase];
            const row = rows.get(board.phase);
            const notAnswered = view.notAnsweredCount[board.phase];
            return (
              <li
                key={board.phase}
                aria-label={`Who can help: ${label}`}
                className="flex flex-col gap-3 rounded-lg border border-border p-4"
              >
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-sm font-semibold">{label}</h3>
                  <p className="text-xs text-muted-foreground">
                    {row?.startDate && row.endDate
                      ? phaseDaysText(row.startDate, row.endDate)
                      : "Days not set yet."}
                  </p>
                </div>
                <AttendancePicker
                  key={`${board.phase}:${view.mine[board.phase] ?? "none"}`}
                  phase={board.phase}
                  answer={view.mine[board.phase] ?? null}
                  open={attendanceIsOpen(row?.startDate, today)}
                />
                <p
                  className="text-xs tabular-nums text-muted-foreground"
                  data-testid={`attendance-counts-${board.phase}`}
                >
                  {countsText(board, notAnswered)}
                </p>
                <dl className="flex flex-col gap-1.5">
                  {ATTENDANCE_ANSWERS.map((a) => (
                    <NameLine
                      key={a}
                      label={ATTENDANCE_ANSWER_LABELS[a]}
                      names={board.names[a]}
                    />
                  ))}
                  {view.namesWhoHaveNotAnswered && (
                    <NameLine label="Not answered" names={board.notAnswered} />
                  )}
                </dl>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** The dates to show members, grouped as the year page groups them. */
function dateGroups(deadlines: DeadlineRow[]) {
  const byKind = new Map(
    deadlines.filter((d) => d.kind).map((d) => [d.kind as string, d]),
  );
  const groups = AFRIKABURN_DATE_GROUPS.map((group) => ({
    key: group.key as string,
    label: group.label,
    rows: AFRIKABURN_DATES.filter((d) => d.group === group.key).flatMap((d) => {
      const row = byKind.get(d.kind);
      // Only what a captain has set: a date, or "No round this year".
      return row && (row.dueDate || row.skipped)
        ? [{ ...row, title: d.name }]
        : [];
    }),
  }));
  groups.push({
    key: "other",
    label: AFRIKABURN_OTHER_GROUP_LABEL,
    rows: deadlines.filter((d) => d.kind === null),
  });
  return groups.filter((g) => g.rows.length > 0);
}

function Deadlines({
  deadlines,
  canManage,
}: {
  deadlines: DeadlineRow[];
  canManage: boolean;
}) {
  const groups = dateGroups(deadlines);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-0">
        <div className="flex flex-col gap-3 px-4 pt-4 page-sm:flex-row page-sm:items-start page-sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">AfrikaBurn dates</h2>
            <p className="text-sm text-muted-foreground">
              The dates AfrikaBurn sets for the camp this year. The ones with a
              date are on the camp calendar too.
            </p>
          </div>
          {canManage && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href={YEAR_SETTINGS_PATH}>Change them</Link>
            </Button>
          )}
        </div>
        {groups.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            No dates yet. The captains fill them in as AfrikaBurn announces
            them.
          </p>
        ) : (
          <div className="flex flex-col">
            {groups.map((group) => (
              <section
                key={group.key}
                aria-label={group.label}
                className="flex flex-col"
              >
                <h3 className="border-t border-border bg-muted/40 px-4 py-2 font-pixel text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
                  {group.label}
                </h3>
                <ul className="flex flex-col">
                  {group.rows.map((d) => (
                    <li
                      key={d.id}
                      aria-label={d.title}
                      className="flex flex-col gap-1 border-t border-border px-4 py-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold">{d.title}</span>
                        <span
                          className={`text-sm tabular-nums text-muted-foreground ${d.dueDate ? "" : "italic"}`}
                        >
                          {d.skipped
                            ? NO_ROUND_THIS_YEAR
                            : d.dueDate
                              ? deadlineDateText(d.dueDate)
                              : NOT_ANNOUNCED_YET}
                          {d.done ? " · Done" : ""}
                        </span>
                      </div>
                      {d.note && (
                        <p className="whitespace-pre-line text-sm text-muted-foreground">
                          {d.note}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
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

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Transport and Logistics"
        title="Logistics"
        description="The year's big days, from packing at the storage unit to unpacking there again. Each one is on the camp calendar too."
        actions={
          <>
            {canAsk && <AskAttendance />}
            <Button asChild variant="outline">
              <Link href="/calendar">
                <CalendarDays aria-hidden />
                Open the calendar
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        {!connected && (
          <p className="rounded-lg border border-border bg-card/40 px-3 py-2.5 text-sm text-muted-foreground">
            {CALENDAR_NOT_CONNECTED_NOTE}
          </p>
        )}
        {!canEdit && (
          <p
            id={REFUSAL_ID}
            className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {LOGISTICS_REFUSAL}
          </p>
        )}

        <Card>
          <CardContent className="p-0">
            <ol aria-label="Logistics days" className="divide-y divide-border">
              {LOGISTICS_PHASES.map((phase, index) => {
                const row = byPhase.get(phase);
                const label = LOGISTICS_PHASE_LABELS[phase];
                const state = calendarState(row, connected);
                return (
                  <li
                    key={phase}
                    aria-label={label}
                    className="flex flex-col gap-3 px-4 py-4 page-sm:flex-row page-sm:items-start page-sm:justify-between"
                  >
                    <div className="flex min-w-0 gap-3">
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/50 text-xs font-semibold text-accent"
                      >
                        {index + 1}
                      </span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <h2 className="text-sm font-semibold">{label}</h2>
                        <p className="text-xs text-muted-foreground">
                          {LOGISTICS_PHASE_HINTS[phase]}
                        </p>
                        {row?.startDate && row.endDate ? (
                          <p className="text-sm tabular-nums">
                            {phaseDaysText(row.startDate, row.endDate)}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Days not set yet.
                          </p>
                        )}
                        {row?.place && (
                          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" aria-hidden />
                            {row.place}
                          </p>
                        )}
                        {row?.note && (
                          <p className="whitespace-pre-line text-sm text-muted-foreground">
                            {row.note}
                          </p>
                        )}
                        {state && <CalendarChip state={state} />}
                      </div>
                    </div>
                    <div className="shrink-0 self-end page-sm:self-start">
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
                        canEdit={canEdit}
                        refusalId={REFUSAL_ID}
                        suggestion={phase === "burn" ? burnDates : null}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <WhoCanHelp
          view={attendance}
          rows={byPhase}
          today={today}
          asked={asked}
        />

        <Deadlines deadlines={deadlines} canManage={rank === "captain"} />
      </div>
    </div>
  );
}
