import { PrintSheet } from "@/components/print/print-sheet";
import { SHEET_TABLE } from "@/lib/print";
import { captainPageGate } from "@/lib/captain-gate";
import { getGenerator, getPowerPlan } from "@/lib/power";
import { listFuelCans } from "@/lib/power-site";

export const dynamic = "force-dynamic";

export const metadata = { title: "Refuelling log sheet — Camp 404" };

// The paper refuelling log for the generator station (#255, #249). Blank rows
// the watch fills in by hand; the entries are typed into the app afterwards
// and marked "Typed in from the paper sheet". It names the generator and the
// cans, and no member: people write their own first name.

const ROWS = 22;

export default async function RefuelSheetPage() {
  // Every approved member may print it, as they read the log.
  await captainPageGate("camp_member");
  const [plan, cans] = await Promise.all([getPowerPlan(), listFuelCans()]);
  const generator = plan.generatorId
    ? await getGenerator(plan.generatorId)
    : null;

  return (
    <PrintSheet
      area="Power & Lighting"
      title="Refuelling log"
      subtitle={
        generator
          ? `Generator: ${generator.model} · tank ${generator.tankLitres} L`
          : "Generator: ____________________"
      }
    >
      <p className="text-sm">
        Write a line each time the generator is filled. Type the lines into the
        app afterwards (Power, Refuelling, Log refuelling) and tick &ldquo;Typed
        in from the paper sheet&rdquo;.
      </p>
      <table className={SHEET_TABLE} aria-label="Refuelling log sheet">
        <thead>
          <tr>
            <th className="w-[13%]">Date</th>
            <th className="w-[10%]">Time</th>
            <th className="w-[10%]">Litres</th>
            <th className="w-[12%]">Can</th>
            <th className="w-[18%]">First name</th>
            <th className="w-[12%]">Hour meter</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: ROWS }, (_, i) => (
            <tr key={i} className="h-8">
              <td />
              <td />
              <td />
              <td />
              <td />
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      {cans.length > 0 && (
        <p className="text-xs text-neutral-700">
          Cans this year: {cans.map((c) => c.label).join(", ")}.
        </p>
      )}
    </PrintSheet>
  );
}
