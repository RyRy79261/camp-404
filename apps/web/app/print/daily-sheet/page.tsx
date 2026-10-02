import Link from "next/link";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { DailySheetPage, GeneralPage } from "@/components/print/daily-sheet";
import { PrintRefusal, PrintSheet } from "@/components/print/print-sheet";
import { auditReadsAfterResponse } from "@/lib/audit";
import { captainPageGate } from "@/lib/captain-gate";
import { getDailySheets } from "@/lib/daily-sheet";
import {
  DAILY_SHEET_REFUSAL,
  EVERY_DAY,
  dailySheetHref,
} from "@/lib/daily-sheet-copy";
import { SHIFTS_PATH } from "@/lib/shifts-copy";

export const dynamic = "force-dynamic";

export const metadata = { title: "Daily site sheet to print — Camp 404" };

// The daily site sheet (#249), in the shared print shell: A4 landscape, a
// real PDF. A captain or a lead picks one day or every day; each day is two
// pages, the day's sheet (each team's tasks from Shifts, the Kitchen's dishes
// and allergies, today's events, notes) and its General page to write on.
//
// Team lead and up (captainPageGate with that rung): the Kitchen's allergy
// line names who has what, and allergies are SAFETY_VISIBLE (captains and team
// leads). A refusal is drawn outside the shell, so it is never a PDF. Every
// member whose allergy is printed gets an audit row of the read, after the
// response (auditReadsAfterResponse), so "who saw my data?" can be answered.

const PRINTED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});

export default async function DailySheetPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const gate = await captainPageGate("team_lead");
  if (!gate.cleared) {
    return (
      <PrintRefusal>
        <p>{DAILY_SHEET_REFUSAL}</p>
      </PrintRefusal>
    );
  }
  const params = await searchParams;
  const asked = typeof params.day === "string" ? params.day : undefined;
  const data = await getDailySheets(asked);
  const every = asked === EVERY_DAY;
  const current = every ? null : (data.sheets[0]?.day ?? null);

  if (data.allergyReaders.length > 0) {
    auditReadsAfterResponse(
      data.allergyReaders.map((memberId) => ({
        actorId: gate.campUser.id,
        action: "safety.allergies.view" as const,
        target: memberId,
        metadata: { via: "daily_sheet", day: current ?? EVERY_DAY },
      })),
    );
  }

  const options = (
    <>
      <Link href={SHIFTS_PATH} className="underline">
        Back to shifts
      </Link>
      {data.days.length > 0 && <span aria-hidden>·</span>}
      {data.days.map((d) => (
        <Link
          key={d.day}
          href={dailySheetHref(d.day)}
          aria-current={d.day === current ? "page" : undefined}
          className={d.day === current ? "font-semibold" : "underline"}
        >
          Day {d.number}
        </Link>
      ))}
      {data.days.length > 1 && (
        <>
          <span aria-hidden>·</span>
          <Link
            href={dailySheetHref(null)}
            aria-current={every ? "page" : undefined}
            className={every ? "font-semibold" : "underline"}
          >
            Every day
          </Link>
        </>
      )}
    </>
  );

  if (data.sheets.length === 0) {
    return (
      <PrintSheet
        area="Daily site sheet"
        title="Daily site sheet"
        options={options}
        orientation="landscape"
      >
        <p>
          There is no sheet yet: the Burn&apos;s days aren&apos;t set on
          Logistics.
        </p>
      </PrintSheet>
    );
  }

  const printed = PRINTED.format(new Date());
  const pages = data.sheets.length * 2;
  const title = every
    ? "Daily site sheets"
    : `Daily site sheet day ${data.sheets[0]!.number}`;
  return (
    <PrintSheet
      area="Daily site sheet"
      title={title}
      options={options}
      orientation="landscape"
      marginMm={9}
      paged
    >
      {data.sheets.flatMap((sheet, i) => [
        <DailySheetPage
          key={`${sheet.day}-sheet`}
          sheet={sheet}
          page={i * 2 + 1}
          pages={pages}
          printed={printed}
        />,
        <GeneralPage
          key={`${sheet.day}-general`}
          sheet={sheet}
          page={i * 2 + 2}
          pages={pages}
          printed={printed}
        />,
      ])}
    </PrintSheet>
  );
}
