import Link from "next/link";
import { campDayKey } from "@camp404/core";
import { PrintSheet } from "@/components/print/print-sheet";
import { SHEET_TABLE } from "@/lib/print";
import { captainPageGate } from "@/lib/captain-gate";
import { getShiftsView } from "@/lib/shifts";
import { SHIFTS_PATH, SHIFTS_PRINT_PATH } from "@/lib/shifts-copy";
import { dailySheetHref } from "@/lib/daily-sheet-copy";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shift roster to print — Camp 404" };

// The shift roster on paper (#248), in the shared print shell (#249: A4,
// black on white, no desktop, Download PDF and Print). There is no internet
// at the burn, so this IS the roster on site; changes there are written on
// it (owner, 2026-09-30). Two sheets per day: the day's roster with who
// signed up and a blank line for each open place, and the same layout blank
// for the whiteboard. The same gate as the screen: any approved member.
// People print as a first name and a surname initial, and nothing else
// about anyone.

export default async function ShiftsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; sheet?: string }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const params = await searchParams;
  // Printed as a member sees it: names only, never ids.
  const view = await getShiftsView({
    userId: campUser.id,
    rank: "camp_member",
    ledTeams: [],
  });
  const blank = params.sheet === "blank";
  const today = campDayKey(new Date());
  const day =
    view.days.find((d) => d.day === params.day) ??
    view.days.find((d) => d.day >= today) ??
    view.days[0] ??
    null;
  const link = (d: string, isBlank: boolean) =>
    `${SHIFTS_PRINT_PATH}?day=${d}${isBlank ? "&sheet=blank" : ""}`;

  const options = (
    <>
      <Link href={SHIFTS_PATH} className="underline">
        Back to shifts
      </Link>
      <span aria-hidden>·</span>
      {view.days.map((d) => (
        <Link
          key={d.day}
          href={link(d.day, blank)}
          aria-current={d.day === day?.day ? "page" : undefined}
          className={d.day === day?.day ? "font-semibold" : "underline"}
        >
          {d.label}
        </Link>
      ))}
      {day && (
        <>
          <span aria-hidden>·</span>
          <Link href={link(day.day, !blank)} className="underline">
            {blank ? "With names" : "Blank for the whiteboard"}
          </Link>
        </>
      )}
      {/* The daily site sheet lists allergies: leads and captains. */}
      {rank !== "camp_member" && (
        <>
          <span aria-hidden>·</span>
          <Link href={dailySheetHref(day?.day ?? null)} className="underline">
            Daily site sheets
          </Link>
        </>
      )}
    </>
  );

  if (!day) {
    return (
      <PrintSheet area="Shifts" title="Camp 404 shifts" options={options}>
        <p>
          There is no roster yet: the Burn&apos;s days aren&apos;t set, or no
          shifts are set up.
        </p>
      </PrintSheet>
    );
  }

  return (
    <PrintSheet
      area="Shifts"
      title="Camp 404 shifts"
      subtitle={`${day.label}${blank ? " · blank" : ""}`}
      options={options}
    >
      {day.slots.length === 0 ? (
        <p>No shifts on this day.</p>
      ) : (
        <table className={SHEET_TABLE} aria-label="Shift roster sheet">
          <thead>
            <tr>
              <th className="w-32">Time</th>
              <th>Shift</th>
              <th className="w-1/2">Who</th>
            </tr>
          </thead>
          <tbody>
            {day.slots.map((slot) => {
              const needed = slot.status === "open";
              const names = blank ? [] : slot.names;
              const empty = needed
                ? Math.max(0, slot.type.places - names.length)
                : 0;
              return (
                <tr
                  key={slot.id}
                  data-testid="print-slot"
                  className="break-inside-avoid align-top"
                >
                  <td className="tabular-nums">{slot.type.timeText}</td>
                  <td>
                    <span className="font-semibold">{slot.type.name}</span>
                    <span className="block text-xs">
                      {slot.type.teamLabel}
                    </span>
                    {slot.type.note && (
                      <span className="block text-xs">{slot.type.note}</span>
                    )}
                  </td>
                  <td>
                    {!needed ? (
                      <span>Not needed</span>
                    ) : (
                      <ol className="flex flex-col gap-1">
                        {names.map((n, i) => (
                          <li key={`${n}-${i}`}>{n}</li>
                        ))}
                        {Array.from({ length: empty }, (_, i) => (
                          <li
                            key={`blank-${i}`}
                            aria-label="Open place"
                            className="h-6 border-b border-dotted border-neutral-700"
                          />
                        ))}
                      </ol>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-xs text-neutral-700">
        MOOP: everyone, all the time. Changes on site: cross out and write the
        new name here.
      </p>
    </PrintSheet>
  );
}
