import { fillingCar, fuelSheetDays, type FuelSheetDay } from "@camp404/core";
import { PrintSheet } from "@/components/print/print-sheet";
import { captainPageGate } from "@/lib/captain-gate";
import { getCampSettings } from "@/lib/camp-config";
import { printName } from "@/lib/lounge-copy";
import { getPowerPlan } from "@/lib/power";
import { cansText, formatNumber, materialText } from "@/lib/power-copy";
import { listFuelCans } from "@/lib/power-site";
import { getTransportBoard } from "@/lib/transport";
import { shortCarLabel } from "@/lib/transport-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fuel can sheet — Camp 404" };

// The can sheet (#255, #249; the owner's register, 2026-10-02), A4. There is
// no signal on site, so this paper is the record there. Page 1 is the fuel can
// list in the app's order, with four EMPTY boxes per can (Filled, At fuel
// depot, At camp, Returned) ticked by hand, and blank rows for cans that turn
// up on site. Page 2 is the day-by-day fuel sheet, one line a day, with the
// days written in when the power plan or the Burn's dates give them. Nothing
// written on it comes back into the app.
//
// Names as every print has them: an owner's first name and surname initial,
// a car as "Dana's Toyota". No contact details.

/** Blank lines for cans added on site, and for days past the plan. */
const SPARE_CAN_ROWS = 6;
const SPARE_DAY_ROWS = 4;

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "Sat 24 Apr · build". */
function dayText(day: FuelSheetDay): string {
  const date = DAY.format(new Date(`${day.date}T00:00:00Z`)).replace(",", "");
  return day.phase === "build" || day.phase === "strike"
    ? `${date} · ${day.phase}`
    : date;
}

const TICKS = ["Filled", "At fuel depot", "At camp", "Returned"] as const;

/**
 * The shared sheet table's thin rules, set a size smaller with tighter cells,
 * so ten columns fit A4 portrait and a car's name reads whole.
 */
const TABLE =
  "w-full table-fixed border-collapse text-xs [&_td]:border [&_td]:border-neutral-400 [&_td]:px-1.5 [&_td]:py-1 [&_th]:border [&_th]:border-neutral-700 [&_th]:bg-neutral-100 [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-left [&_th]:align-bottom [&_th]:text-[10px] [&_th]:leading-tight [&_th]:font-semibold";

function Box() {
  return (
    <span
      aria-hidden
      className="inline-block size-[13px] border-[1.5px] border-neutral-900 align-[-2px]"
    />
  );
}

function Blank({ className = "w-12" }: { className?: string }) {
  return (
    <span
      className={`ml-1.5 inline-block border-b border-neutral-900 ${className}`}
    />
  );
}

export default async function FuelCanSheetPage() {
  // Every approved member may print it, as they read the list.
  await captainPageGate("camp_member");
  const [cans, board, plan, settings] = await Promise.all([
    listFuelCans(),
    getTransportBoard(),
    getPowerPlan(),
    getCampSettings(),
  ]);
  const total = cans.reduce((sum, c) => sum + c.sizeLitres, 0);
  const days = fuelSheetDays({
    firstPoweredDay: plan.firstPoweredDay,
    daysOnSite: plan.daysOnSite,
    burnStart: settings.current?.burnStart ?? null,
    burnEnd: settings.current?.burnEnd ?? null,
  });
  const printed = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(new Date());

  return (
    <PrintSheet
      area="Power & Lighting"
      title="Fuel cans"
      subtitle={`${cansText(cans.length)} this year · ${formatNumber(total, 1)} L in all · each driver fills the cans in their car before leaving home`}
    >
      <p className="border-[1.5px] border-neutral-900 px-2.5 py-2 text-sm leading-snug">
        <b>Keep about 30 L or less at camp at a time.</b> Fire &amp; Fuel hold
        the rest at the fuel depot and bring cans when we ask.
      </p>
      <table className={TABLE} aria-label="Fuel cans">
        <thead>
          <tr>
            <th className="w-[4%]">#</th>
            <th className="w-[13%]">Owner</th>
            <th className="w-[7%]">Size</th>
            <th className="w-[9%]">Material</th>
            <th className="w-[17%]">Travels with</th>
            {TICKS.map((t) => (
              <th key={t} className="w-[8%] px-1! text-center!">
                {t}
              </th>
            ))}
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {cans.map((c, i) => {
            const car = fillingCar(c, board.cars);
            return (
              <tr key={c.id} className="h-8">
                <td className="tabular-nums">{i + 1}</td>
                <td className="leading-tight">
                  {c.ownerUserId ? printName(c.ownerName ?? "") : "Camp"}
                </td>
                <td className="whitespace-nowrap tabular-nums">
                  {formatNumber(c.sizeLitres, 1)} L
                </td>
                <td>{c.material ? materialText(c.material) : ""}</td>
                <td className="leading-tight">
                  {car ? shortCarLabel(car) : ""}
                </td>
                {TICKS.map((t) => (
                  <td key={t} className="text-center">
                    <Box />
                  </td>
                ))}
                <td className="leading-tight">{c.note}</td>
              </tr>
            );
          })}
          {Array.from({ length: SPARE_CAN_ROWS }, (_, i) => (
            <tr key={`spare-${i}`} className="h-8">
              <td />
              <td />
              <td />
              <td />
              <td />
              {TICKS.map((t) => (
                <td key={t} className="text-center">
                  <Box />
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm">
        At camp now: <Blank /> L
      </p>
      <p className="flex justify-between border-t border-neutral-300 pt-1.5 text-xs text-neutral-600">
        <span>Keep with the generator.</span>
        <span>Printed {printed}</span>
      </p>

      <section
        aria-label="Fuel: day by day"
        className="mt-6 flex break-before-page flex-col gap-5 border-t-2 border-dashed border-neutral-300 pt-8 print:mt-0 print:border-0 print:pt-0"
      >
        <header className="flex flex-col gap-1 border-b-2 border-neutral-900 pb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600">
            Camp 404 · Power &amp; Lighting
          </p>
          <h2 className="text-2xl font-bold">Fuel: day by day</h2>
          <p className="text-sm text-neutral-700">
            One line a day. Fill it in at dinner.
          </p>
        </header>
        <table className={TABLE} aria-label="Fuel day by day">
          <thead>
            <tr>
              <th className="w-[21%]">Day</th>
              <th className="w-[11%] text-center!">Cans at camp</th>
              <th className="w-[11%] text-center!">Litres at camp</th>
              <th className="w-[10%] text-center!">Cans used</th>
              <th className="w-[11%] text-center!">Cans returned</th>
              <th className="w-[12%] text-center!">Generator hours</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {[...days.map(dayText), ...Array(SPARE_DAY_ROWS).fill("")].map(
              (label: string, i) => (
                <tr key={i} className="h-8">
                  <td className="whitespace-nowrap">{label}</td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              ),
            )}
          </tbody>
        </table>
        <p className="text-sm">
          Used this burn: <Blank /> cans <Blank className="ml-4 w-12" /> litres
        </p>
        <p className="flex justify-between border-t border-neutral-300 pt-1.5 text-xs text-neutral-600">
          <span>Keep with the generator.</span>
          <span>Printed {printed}</span>
        </p>
      </section>
    </PrintSheet>
  );
}
