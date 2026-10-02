import "server-only";

import { cache } from "react";
import { canEditPower, POWER_TEAM } from "@camp404/core";
import type { Team } from "@camp404/types";
import { getCampSettings } from "./camp-config";
import { captainPageGate } from "./captain-gate";
import {
  getGenerator,
  getPowerPlan,
  listGenerators,
  listPowerLoads,
} from "./power";
import {
  getSharingAgreement,
  listFuelCans,
  listGridNodes,
  listLoadGridPoints,
  listReadinessItems,
  listRefuelEntries,
} from "./power-site";
import type { PowerOverview } from "./power-summary";
import { listTeamPeople } from "./roster";
import { getLeadTeams } from "./users";

// The rows every Power section and the answer rail read, fetched once per
// request, in parallel: the rail (components/power/power-frame.tsx) and the
// section page share the one read through React's cache.

/** Every approved member reads Power; a captain or a P&L lead edits it. */
export const powerViewer = cache(async () => {
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  return { campUser, rank, canEdit: canEditPower(rank, leadTeams) };
});

/**
 * Who to ask, and which year: this year's Power & Lighting leads by name (a
 * reader's note says "Ask Pat Mokoena.") and the burn year for the eyebrow.
 */
export const powerTeamContext = cache(async () => {
  const [people, settings] = await Promise.all([
    listTeamPeople(POWER_TEAM as Team),
    getCampSettings(),
  ]);
  return {
    leadNames: people.filter((p) => p.isLead).map((p) => p.displayName),
    year: settings.current?.year ?? null,
  };
});

/** "Pat Mokoena", "Pat Mokoena or Sipho Dlamini", "A, B or C". */
export function namesOr(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export const getPowerOverview = cache(async (): Promise<PowerOverview> => {
  const [
    loads,
    plan,
    generators,
    cans,
    entries,
    nodes,
    where,
    items,
    agreement,
  ] = await Promise.all([
    listPowerLoads(),
    getPowerPlan(),
    listGenerators(),
    listFuelCans(),
    listRefuelEntries(),
    listGridNodes(),
    listLoadGridPoints(),
    listReadinessItems(),
    getSharingAgreement(),
  ]);
  // A plan or an agreement may name a generator archived since; it still reads.
  const find = async (id: string | null) =>
    id === null
      ? null
      : (generators.find((g) => g.id === id) ?? (await getGenerator(id)));
  const [generator, shareGenerator] = await Promise.all([
    find(plan.generatorId),
    find(agreement?.generatorSource === "ours" ? agreement.generatorId : null),
  ]);
  return {
    loads,
    plan,
    generators,
    generator,
    cans,
    entries,
    nodes,
    where,
    items,
    agreement,
    shareGenerator,
  };
});
