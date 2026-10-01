import Link from "next/link";
import { campDayKey } from "@camp404/core";
import { PrintButton } from "@/components/lounge/lounge-controls";
import { captainPageGate } from "@/lib/captain-gate";
import { getShiftsView } from "@/lib/shifts";
import { SHIFTS_PATH, SHIFTS_PRINT_PATH } from "@/lib/shifts-copy";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shift roster to print — Camp 404" };

// The shift roster on paper (#248, printed the #249 way: a page outside the
// console, black on white, no header or nav, and the browser's print dialog
// for a PDF). There is no internet at the burn, so this IS the roster on
// site; changes there are written on it (owner, 2026-09-30). Two sheets per
// day: the day's roster with who signed up and a blank line for each open
// place, and the same layout blank for the whiteboard. The same gate as the
// screen: any approved member. People print as a first name and a surname
// initial, and nothing else about anyone.

export default async function ShiftsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; sheet?: string }>;
}) {
  const { campUser } = await captainPageGate("camp_member");
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

  return (
    <div className="min-h-screen bg-white px-6 py-8 text-black print:p-0">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <nav
          aria-label="Print options"
          className="flex flex-wrap items-center gap-2 text-sm print:hidden"
        >
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
          <span className="ml-auto">
            <PrintButton />
          </span>
        </nav>

        {!day ? (
          <p>
            There is no roster yet: the Burn&apos;s days aren&apos;t set, or no
            shifts are set up.
          </p>
        ) : (
          <section aria-labelledby="sheet-title">
            <h1 id="sheet-title" className="text-2xl font-bold">
              Camp 404 shifts
            </h1>
            <p className="mb-4 text-lg">
              {day.label}
              {blank ? " · blank" : ""}
            </p>
            {day.slots.length === 0 ? (
              <p>No shifts on this day.</p>
            ) : (
              <table className="w-full border-collapse text-base">
                <thead>
                  <tr className="border-b-2 border-black text-left">
                    <th className="w-32 py-2">Time</th>
                    <th className="py-2">Shift</th>
                    <th className="w-1/2 py-2">Who</th>
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
                        className="break-inside-avoid border-b border-black/40 align-top"
                      >
                        <td className="py-2 tabular-nums">
                          {slot.type.timeText}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-semibold">
                            {slot.type.name}
                          </span>
                          <span className="block text-sm">
                            {slot.type.teamLabel}
                          </span>
                          {slot.type.note && (
                            <span className="block text-sm">
                              {slot.type.note}
                            </span>
                          )}
                        </td>
                        <td className="py-2">
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
                                  className="h-6 border-b border-dotted border-black"
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
            <p className="mt-4 text-sm">
              MOOP: everyone, all the time. Changes on site: cross out and write
              the new name here.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
