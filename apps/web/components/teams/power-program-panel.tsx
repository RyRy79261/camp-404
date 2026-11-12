import { canEditPower, errorLogText } from "@camp404/core";
import { getGenerator, getPowerPlan, listPowerLoads } from "@/lib/power";
import { powerGlance, powerSiteGlance } from "@/lib/power-glance";
import { listFuelCans, listReadinessItems } from "@/lib/power-site";
import { getTransportBoard } from "@/lib/transport";
import { PowerGlanceCard } from "./power-glance-card";
import type { TeamPanelProps } from "./team-panels";

// Power and Lighting's own panel on its program: this year's loads, plan and
// chosen generator, through the same reads the Power tool uses (the test store
// under E2E), turned into the plan's headline figures. Beside them
// (2026-11-12), the fuel cans that travel with a car (the register and this
// year's cars, as the Fuel page counts them) and the plan generator's
// readiness checks.

export async function PowerProgramPanel({ rank, leadTeams }: TeamPanelProps) {
  // The site figures are extra: if their reads fail, the plan's own figures
  // still show (logged, the two tiles left out).
  const siteReads = Promise.all([
    listFuelCans(),
    getTransportBoard(),
    listReadinessItems(),
  ]).catch((error: unknown) => {
    console.error("[team-panel:power-site]", errorLogText(error, process.env));
    return null;
  });
  const [loads, plan, siteData] = await Promise.all([
    listPowerLoads(),
    getPowerPlan(),
    siteReads,
  ]);
  // The plan may name a generator archived since; it still counts.
  const generator = plan.generatorId
    ? await getGenerator(plan.generatorId)
    : null;
  return (
    <PowerGlanceCard
      glance={powerGlance({ loads, plan, generator })}
      site={
        siteData
          ? powerSiteGlance({
              cans: siteData[0],
              cars: siteData[1].cars,
              generatorId: plan.generatorId,
              items: siteData[2],
            })
          : undefined
      }
      canEdit={canEditPower(rank, leadTeams)}
    />
  );
}
