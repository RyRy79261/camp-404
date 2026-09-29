import Link from "next/link";
import { loungeDayOf, loungeDays } from "@camp404/core";
import { LOUNGE_BANDS } from "@camp404/types";
import { PrintButton } from "@/components/lounge/lounge-controls";
import { getCampSettings } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { getLoungeProgramme } from "@/lib/lounge";
import {
  BAND_NAMES,
  KIND_LABELS,
  LOUNGE_PATH,
  LOUNGE_PRINT_PATH,
  bandLabel,
  printName,
  timeRangeText,
} from "@/lib/lounge-copy";
import { buildProgramme, dayItems } from "@/lib/lounge-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lounge programme to print — Camp 404" };

// The lounge on paper (#269, printed the #249 way: a page outside the console,
// black on white, no header or nav, and the browser's print dialog for a PDF).
// Two sheets: one day's programme to pin up, and the blank whiteboard grid
// (days across, time bands down) to fill in by hand on site. The same gate as
// the screen: any approved member. Hosts print as a first name and a surname
// initial, and nothing else about anyone.

export default async function LoungePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; sheet?: string }>;
}) {
  await captainPageGate("camp_member");
  const [camp, params] = await Promise.all([getCampSettings(), searchParams]);
  const programme = await getLoungeProgramme(camp.cycleNumber);
  const burn =
    camp.current?.burnStart && camp.current.burnEnd
      ? { start: camp.current.burnStart, end: camp.current.burnEnd }
      : null;
  const days = loungeDays(burn);
  const blank = params.sheet === "blank";
  const asked = Number(params.day);
  const day =
    days.find((d) => d.day === asked)?.day ??
    loungeDayOf(new Date(), days) ??
    1;
  const label = days.find((d) => d.day === day)?.label ?? `Day ${day}`;
  const items = dayItems(buildProgramme(programme, days), day);

  return (
    <div className="min-h-screen bg-white px-6 py-8 text-black print:p-0">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <nav
          aria-label="Print options"
          className="flex flex-wrap items-center gap-2 text-sm print:hidden"
        >
          <Link href={LOUNGE_PATH} className="underline">
            Back to the lounge programme
          </Link>
          <span aria-hidden>·</span>
          {days.map((d) => (
            <Link
              key={d.day}
              href={`${LOUNGE_PRINT_PATH}?day=${d.day}`}
              aria-current={!blank && d.day === day ? "page" : undefined}
              className={
                !blank && d.day === day ? "font-semibold" : "underline"
              }
            >
              Day {d.day}
            </Link>
          ))}
          <span aria-hidden>·</span>
          <Link
            href={`${LOUNGE_PRINT_PATH}?sheet=blank`}
            aria-current={blank ? "page" : undefined}
            className={blank ? "font-semibold" : "underline"}
          >
            Blank whiteboard
          </Link>
          <span className="ml-auto">
            <PrintButton />
          </span>
        </nav>

        {blank ? (
          <section aria-labelledby="blank-title">
            <h1 id="blank-title" className="mb-4 text-2xl font-bold">
              Camp 404 lounge
            </h1>
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-24 border border-black p-1 text-left">
                    Time
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.day}
                      className="border border-black p-1 text-left"
                    >
                      {d.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LOUNGE_BANDS.map((b) => (
                  <tr key={b}>
                    <th className="h-24 border border-black p-1 text-left align-top font-medium">
                      {BAND_NAMES[b]}
                      <span className="block text-xs font-normal">
                        {bandLabel(b).split(", ")[1]}
                      </span>
                    </th>
                    {days.map((d) => (
                      <td key={d.day} className="border border-black" />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <section aria-labelledby="day-title">
            <h1 id="day-title" className="text-2xl font-bold">
              Camp 404 lounge
            </h1>
            <p className="mb-4 text-lg">{label}</p>
            {items.length === 0 ? (
              <p>Nothing on the programme yet. The lounge is open all day.</p>
            ) : (
              <table className="w-full border-collapse text-base">
                <thead>
                  <tr className="border-b-2 border-black text-left">
                    <th className="w-36 py-2">Time</th>
                    <th className="py-2">What</th>
                    <th className="w-40 py-2">Who</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr
                      key={i.id}
                      data-testid="print-item"
                      className="border-b border-black/40 align-top"
                    >
                      <td className="py-2 tabular-nums">
                        {timeRangeText(i.startMinute, i.durationMinutes)}
                      </td>
                      <td className="py-2">
                        <span className="font-semibold">{i.title}</span>
                        <span className="block text-sm">
                          {KIND_LABELS[i.kind]}
                        </span>
                      </td>
                      <td className="py-2">{printName(i.hostName)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
