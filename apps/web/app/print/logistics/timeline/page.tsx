import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  burnTimeline,
  shortDay,
  type TimelineColumn,
  type TimelinePhase,
} from "@camp404/core";
import {
  ATTENDANCE_PHASES,
  LOGISTICS_PHASES,
  LOGISTICS_PHASE_LABELS,
  type LogisticsPhase,
} from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import {
  LIST_TABLE,
  LIST_TD,
  LIST_TH,
  printedOn,
} from "@/components/print/print-kit";
import { PrintPage, PrintSheet } from "@/components/print/print-sheet";
import { getCurrentCycle } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import {
  countAcceptedMembers,
  getAttendanceView,
  listLogisticsPhases,
} from "@/lib/logistics";
import { LOGISTICS_PATH } from "@/lib/logistics-copy";
import { ledgerCycle } from "@/lib/payments";

export const dynamic = "force-dynamic";

export const metadata = { title: "Burn timeline to print — Camp 404" };

// The burn timeline on A4 landscape (#249; the owner approved Option A of
// design/print-burn-timeline.html, 2026-10-02), in the shared print shell
// with a real PDF. A strip of days from Pack to Unpack, from Logistics: each
// phase a band, ALL HANDS on the days the whole camp is asked to help, and
// how many are coming each day (burnTimeline in @camp404/core). Under it, a
// line per phase: dates, place and note.
//
// Counts only, never names. Every approved member reads Logistics, and
// attendance answers there, so every member prints it. Burn days count the
// members the captains accepted: a count the join site shows publicly too.
// Attendance is asked per phase, not per day, so each day of a phase shows
// the phase's count.

/** Each phase's quiet tint, the mock-up's. */
const PHASE_TINT: Record<LogisticsPhase, string> = {
  pack: "#e8f2fa",
  travel: "#eff1f3",
  build: "#fbf5e0",
  burn: "#f8e9ed",
  strike: "#fcefe4",
  unpack: "#e9f5ec",
};

const WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "Thu 22 – Sat 24 Apr", "Sun 2 – Mon 3 May", "Sat 17 Apr". */
function rangeText(start: string, end: string): string {
  if (start === end) return shortDay(start);
  const [, , startMonth] = shortDay(start).split(" ");
  const [, , endMonth] = shortDay(end).split(" ");
  const first =
    startMonth === endMonth
      ? `${WEEKDAY.format(at(start))} ${at(start).getUTCDate()}`
      : shortDay(start);
  return `${first} – ${shortDay(end)}`;
}

const GAP = "bg-[repeating-linear-gradient(135deg,#fff_0_4px,#eee_4px_8px)]";
const CELL =
  "min-h-4 border-b border-r border-b-neutral-300 border-r-neutral-200 px-[3px] py-1 text-center";
const LABEL =
  "border-b border-r border-b-neutral-300 border-r-neutral-500 px-[3px] py-1 text-left text-[9.5px] font-semibold tracking-[0.04em] text-neutral-700";

function Row({
  label,
  columns,
  cell,
}: {
  label: string;
  columns: readonly TimelineColumn[];
  cell: (c: Extract<TimelineColumn, { kind: "day" }>) => {
    content: ReactNode;
    className?: string;
    style?: CSSProperties;
  };
}) {
  return (
    <tr>
      <th scope="row" className={LABEL}>
        {label}
      </th>
      {columns.map((c, i) => {
        if (c.kind === "gap") {
          return <td key={i} aria-hidden className={cn(CELL, GAP)} />;
        }
        const { content, className, style } = cell(c);
        return (
          <td key={i} className={cn(CELL, className)} style={style}>
            {content}
          </td>
        );
      })}
    </tr>
  );
}

export default async function BurnTimelinePrintPage() {
  const { campUser, rank } = await captainPageGate("camp_member");
  const [rows, cycle, year] = await Promise.all([
    listLogisticsPhases(),
    getCurrentCycle(),
    ledgerCycle(),
  ]);
  const [attendance, accepted] = await Promise.all([
    getAttendanceView({ userId: campUser.id, rank, cycle: year }),
    countAcceptedMembers(year),
  ]);

  // The Burn's own dates from the camp's year stand in until Logistics sets
  // them, as the Burn's editor starts from them.
  const byPhase = new Map(rows.map((r) => [r.phase, r]));
  const phases: (TimelinePhase & {
    place: string | null;
    note: string | null;
  })[] = LOGISTICS_PHASES.map((phase) => {
    const row = byPhase.get(phase);
    if (
      phase === "burn" &&
      !row?.startDate &&
      cycle?.burnStart &&
      cycle.burnEnd
    ) {
      return {
        phase,
        startDate: cycle.burnStart,
        endDate: cycle.burnEnd,
        place: row?.place ?? null,
        note: row?.note ?? null,
      };
    }
    return {
      phase,
      startDate: row?.startDate ?? null,
      endDate: row?.endDate ?? null,
      place: row?.place ?? null,
      note: row?.note ?? null,
    };
  });
  const answers = Object.fromEntries(
    attendance.phases.map((p) => [
      p.phase,
      { going: p.names.going.length, maybe: p.names.maybe.length },
    ]),
  );
  const columns = burnTimeline({ phases, answers, accepted });
  const dated = phases.filter(
    (p): p is typeof p & { startDate: string; endDate: string } =>
      p.startDate !== null && p.endDate !== null,
  );
  const pack = dated.find((p) => p.phase === "pack");
  const unpack = dated.find((p) => p.phase === "unpack");

  const subtitle = [
    cycle ? `AfrikaBurn ${cycle.year}` : null,
    pack && unpack
      ? `Pack ${shortDay(pack.startDate)} to Unpack ${shortDay(unpack.endDate)}`
      : null,
    `${accepted} ${accepted === 1 ? "member" : "members"} accepted`,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");

  return (
    <PrintSheet
      area="Logistics"
      title="Burn timeline"
      options={
        <Link href={LOGISTICS_PATH} className="underline">
          Back to Logistics
        </Link>
      }
      orientation="landscape"
      marginMm={9}
      paged
    >
      <PrintPage
        area="Logistics"
        title="Burn timeline"
        subtitle={subtitle}
        footer="People: going on the days we asked; accepted members on burn days. Shaded: days with nothing on."
        footerEnd={`Printed ${printedOn(new Date())} · page 1 of 1`}
      >
        {columns.length === 0 ? (
          <p className="text-[12px]">
            No days are set yet. A captain or a Transport and Logistics lead
            sets them on Logistics.
          </p>
        ) : (
          <table
            aria-label="Days"
            data-testid="timeline-strip"
            className="w-full table-fixed border-collapse border-t-[1.5px] border-neutral-900 text-[10.5px]"
          >
            <colgroup>
              <col className="w-[78px]" />
            </colgroup>
            <tbody>
              <Row
                label="Day"
                columns={columns}
                cell={(c) => ({
                  content: (
                    <>
                      <span className="font-semibold">
                        {WEEKDAY.format(at(c.date))}
                      </span>
                      <small className="block text-[9px] text-neutral-600">
                        {DAY_MONTH.format(at(c.date))}
                      </small>
                    </>
                  ),
                })}
              />
              <Row
                label="Phase"
                columns={columns}
                cell={(c) => ({
                  content: c.first ? LOGISTICS_PHASE_LABELS[c.phase] : null,
                  className:
                    "text-[10px] font-bold uppercase tracking-[0.06em]",
                  style: { background: PHASE_TINT[c.phase] },
                })}
              />
              <Row
                label="All hands"
                columns={columns}
                cell={(c) => ({
                  content: c.allHands ? "ALL HANDS" : null,
                  className: "text-[9px] font-bold tracking-[0.08em]",
                })}
              />
              <Row
                label="People"
                columns={columns}
                cell={(c) => ({
                  content: (
                    <span data-testid="timeline-people">{c.people ?? "–"}</span>
                  ),
                  className: "text-[13px] font-bold",
                })}
              />
              <Row
                label="+ maybe"
                columns={columns}
                cell={(c) => ({
                  content: c.maybe ? `+${c.maybe}` : null,
                  className: "text-neutral-600",
                })}
              />
            </tbody>
          </table>
        )}

        {dated.length > 0 && (
          <table
            className={`${LIST_TABLE} mt-3.5 text-[11px]`}
            aria-label="Phases"
          >
            <thead>
              <tr>
                <th className={`${LIST_TH} w-[80px]`}>Phase</th>
                <th className={`${LIST_TH} w-[170px]`}>Dates</th>
                <th className={`${LIST_TH} w-[190px]`}>Where</th>
                <th className={LIST_TH}>Note</th>
              </tr>
            </thead>
            <tbody>
              {dated.map((p) => (
                <tr key={p.phase}>
                  <td className={`${LIST_TD} font-bold`}>
                    {LOGISTICS_PHASE_LABELS[p.phase]}
                    {(ATTENDANCE_PHASES as readonly string[]).includes(
                      p.phase,
                    ) && <span className="sr-only"> (all hands)</span>}
                  </td>
                  <td className={LIST_TD}>
                    {rangeText(p.startDate, p.endDate)}
                  </td>
                  <td className={LIST_TD}>{p.place ?? ""}</td>
                  <td className={LIST_TD}>{p.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PrintPage>
    </PrintSheet>
  );
}
