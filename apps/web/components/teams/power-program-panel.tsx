import { canEditPower } from "@camp404/core";
import { getGenerator, getPowerPlan, listPowerLoads } from "@/lib/power";
import { powerGlance } from "@/lib/power-glance";
import { PowerGlanceCard } from "./power-glance-card";
import type { TeamPanelProps } from "./team-panels";

// Power and Lighting's own panel on its program: this year's loads, plan and
// chosen generator, through the same reads the Power tool uses (the test store
// under E2E), turned into the plan's headline figures.

export async function PowerProgramPanel({ rank, leadTeams }: TeamPanelProps) {
  const [loads, plan] = await Promise.all([listPowerLoads(), getPowerPlan()]);
  // The plan may name a generator archived since; it still counts.
  const generator = plan.generatorId
    ? await getGenerator(plan.generatorId)
    : null;
  return (
    <PowerGlanceCard
      glance={powerGlance({ loads, plan, generator })}
      canEdit={canEditPower(rank, leadTeams)}
    />
  );
}
