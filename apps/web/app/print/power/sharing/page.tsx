import {
  connectedWatts,
  fixedSplit,
  fuelForPlan,
  fuelSplit,
  powerTotals,
  splitLitres,
} from "@camp404/core";
import { PrintSheet } from "@/components/print/print-sheet";
import { SHEET_TABLE } from "@/lib/print";
import { captainPageGate } from "@/lib/captain-gate";
import { getGenerator, getPowerPlan, listPowerLoads } from "@/lib/power";
import { formatNumber, litres, watts } from "@/lib/power-copy";
import { getSharingAgreement } from "@/lib/power-site";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sharing summary — Camp 404" };

// The generator-sharing summary on paper (#257), to hand over on site: the two
// camps, whose generator, the fuel split in percent and litres, the watches,
// and the neighbour's loads. It names no member (the contact is a role, the
// watches are camps and times) and holds no money. The app sends it nowhere:
// it is printed, as the other on-site sheets are.

export default async function SharingSummaryPage() {
  // Every approved member may print it, as they read the agreement.
  await captainPageGate("camp_member");
  const [agreement, plan, loads] = await Promise.all([
    getSharingAgreement(),
    getPowerPlan(),
    listPowerLoads(),
  ]);

  if (!agreement) {
    return (
      <PrintSheet area="Power & Lighting" title="Sharing a generator">
        <p className="text-sm">There is no sharing agreement this year.</p>
      </PrintSheet>
    );
  }

  const theirs = loads.filter((l) => l.owner === "neighbour");
  const ours = loads.filter((l) => l.owner !== "neighbour");
  const split =
    agreement.partnerFuelPct != null
      ? fixedSplit(agreement.partnerFuelPct)
      : fuelSplit(
          powerTotals(ours, plan.daysOnSite, plan.powerFactor).burnKwh,
          powerTotals(theirs, plan.daysOnSite, plan.powerFactor).burnKwh,
        );
  const generator =
    agreement.generatorSource === "ours" && agreement.generatorId
      ? await getGenerator(agreement.generatorId)
      : null;
  const fuel =
    generator && loads.length > 0
      ? fuelForPlan({
          loads,
          generator,
          plan: {
            powerFactor: plan.powerFactor,
            daysOnSite: plan.daysOnSite,
            lowLoadFactor: plan.lowLoadFactor,
            safetyMarginPct: plan.safetyMarginPct,
          },
          schedule: { fromHour: plan.runFromHour, toHour: plan.runToHour },
        })
      : null;
  const shared = fuel ? splitLitres(fuel.litresWithMargin, split) : null;
  const generatorText =
    agreement.generatorSource === "ours"
      ? `Camp 404's: ${generator?.model ?? "—"}`
      : `${agreement.partnerCamp}'s${agreement.theirGenerator ? `: ${agreement.theirGenerator}` : ""}`;

  return (
    <PrintSheet
      area="Power & Lighting"
      title="Sharing a generator"
      subtitle={`Camp 404 and ${agreement.partnerCamp}`}
    >
      <table className={SHEET_TABLE} aria-label="The agreement">
        <tbody>
          <tr>
            <th className="w-1/3">Generator</th>
            <td>{generatorText}</td>
          </tr>
          <tr>
            <th>Speak to at {agreement.partnerCamp}</th>
            <td>{agreement.contactRole ?? "—"}</td>
          </tr>
          <tr>
            <th>Fuel: Camp 404</th>
            <td className="tabular-nums">
              {formatNumber(split.ourPct, 1)}%
              {shared ? ` · ${litres(shared.ours, 1)}` : ""}
            </td>
          </tr>
          <tr>
            <th>Fuel: {agreement.partnerCamp}</th>
            <td className="tabular-nums">
              {formatNumber(split.theirPct, 1)}%
              {shared ? ` · ${litres(shared.theirs, 1)}` : ""}
            </td>
          </tr>
          <tr>
            <th>Watches</th>
            <td className="whitespace-pre-line">
              {agreement.watchCover ?? "—"}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-neutral-700">
        {agreement.partnerFuelPct != null
          ? "The fuel split was set by the Power & Lighting team."
          : "The fuel split is each camp's share of the energy the generator delivers."}
        {fuel
          ? ` Litres are of the ${litres(fuel.litresWithMargin, 1)} planned for ${plan.daysOnSite} days, with the safety margin.`
          : ""}
      </p>

      <h2 className="text-base font-bold">
        {agreement.partnerCamp}&apos;s loads
      </h2>
      {theirs.length === 0 ? (
        <p className="text-sm">None listed yet.</p>
      ) : (
        <table className={SHEET_TABLE} aria-label="Their loads">
          <thead>
            <tr>
              <th>Load</th>
              <th className="text-right">Full draw</th>
            </tr>
          </thead>
          <tbody>
            {theirs.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td className="text-right tabular-nums">
                  {watts(connectedWatts(l))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintSheet>
  );
}
