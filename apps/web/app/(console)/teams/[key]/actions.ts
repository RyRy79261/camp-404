"use server";

import { revalidatePath } from "next/cache";
import { canEditTeamProgram } from "@camp404/core";
import { TeamProgramInput } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import {
  CHECK_TEAM_PROGRAM,
  TEAM_PROGRAM_REFUSAL,
  teamProgramPath,
} from "@/lib/team-program-copy";
import { saveTeamProgram } from "@/lib/team-programs";
import { getLeadTeams } from "@/lib/users";

// A team program's one write today: its description (owner's ruling 4,
// 2026-09-27). The gate (the team_lead rung, clearance being
// global), the Zod boundary, then canEditTeamProgram on the teams the actor
// leads, so a lead of another team is told here. The rule is checked again
// inside the write's own transaction, which re-reads the actor's rank and led
// teams and never takes a team list from here.

export async function saveTeamProgramAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("saveTeamProgramAction", async () => {
    const gate = await captainActionGate("team_lead", TEAM_PROGRAM_REFUSAL);
    if (!gate.ok) return gate;
    const parsed = TeamProgramInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_TEAM_PROGRAM,
      };
    }
    const led =
      gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
    if (!canEditTeamProgram(gate.rank, led, parsed.data.team)) {
      return { ok: false, error: TEAM_PROGRAM_REFUSAL };
    }
    const result = await saveTeamProgram({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath(teamProgramPath(parsed.data.team));
    return { ok: true, data: { version: result.version } };
  });
}
