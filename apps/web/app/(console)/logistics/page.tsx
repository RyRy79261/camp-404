import Link from "next/link";
import {
  CalendarDays,
  CalendarCheck,
  CalendarX,
  Lock,
  MapPin,
} from "lucide-react";
import { canEditLogistics } from "@camp404/core";
import {
  LOGISTICS_PHASES,
  LOGISTICS_PHASE_HINTS,
  LOGISTICS_PHASE_LABELS,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { PhaseEditButton } from "@/components/logistics/phase-editor";
import { getCurrentCycle } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import {
  isLogisticsCalendarConnected,
  listLogisticsPhases,
  type LogisticsPhaseRow,
} from "@/lib/logistics";
import {
  CALENDAR_NOT_CONNECTED_NOTE,
  LOGISTICS_REFUSAL,
  phaseDaysText,
} from "@/lib/logistics-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Logistics — Camp 404" };

// The logistics calendar (#247): the year's pack, travel, build, burn, strike
// and unpack days, in the order the camp lives them. Every approved member
// reads it; a captain or a Transport and Logistics lead sets the days. Each
// phase with days is one event on the camp's shared Google Calendar (owner,
// 2026-09-28: the calendar stays on Google), so it shows on the Calendar, on
// Home's "Coming up" and on the team's page too. Composed as the load list:
// one card of rows, Edit per row opening a dialog, and for everyone else the
// Edit buttons PRESENT BUT DISABLED with one Lock line that each describes to.

const REFUSAL_ID = "logistics-edit-refusal";

type CalendarState = "on" | "pending" | "off";

/** Where a phase stands on the camp calendar, for the chip beside it. */
function calendarState(
  row: LogisticsPhaseRow | undefined,
  connected: boolean,
): CalendarState | null {
  if (!connected || !row) return null;
  if (row.startDate === null) {
    // Cleared: only worth a word while its event may still be there.
    return row.calendarEventId && row.calendarSyncedVersion !== row.version
      ? "pending"
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
      Not on the camp calendar yet. Save again to retry.
    </span>
  );
}

export default async function LogisticsPage() {
  // Every approved member reads the days.
  const { campUser, rank } = await captainPageGate("camp_member");
  const [leadTeams, rows, cycle] = await Promise.all([
    rank === "team_lead" ? getLeadTeams(campUser.id) : Promise.resolve([]),
    listLogisticsPhases(),
    getCurrentCycle(),
  ]);
  const canEdit = canEditLogistics(rank, leadTeams);
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
          <Button asChild variant="outline">
            <Link href="/calendar">
              <CalendarDays aria-hidden />
              Open the calendar
            </Link>
          </Button>
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
      </div>
    </div>
  );
}
