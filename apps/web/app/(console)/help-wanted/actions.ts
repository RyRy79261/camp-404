"use server";

import { revalidatePath } from "next/cache";
import { mayOfferLeadPost } from "@/lib/telegram-places";
import { canPickTeamLead, roleKeeper, type Actor } from "@camp404/core";
import {
  CopyTeamRolesInput,
  RemoveTeamRoleInput,
  SaveTeamRoleInput,
  SetLeadPlacesInput,
  TeamRoleKeenInput,
  TeamRoleMemberInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import {
  copyLastYearsRoles,
  giveTeamRole,
  removeTeamRole,
  saveTeamRole,
  setKeen,
  setLeadPlaces,
  takeTeamRole,
} from "@/lib/help-wanted";
import {
  CHECK_ROLE,
  HELP_WANTED_PATH,
  HELP_WANTED_REFUSAL,
  RELOAD,
} from "@/lib/help-wanted-copy";
import { revalidateManifest } from "@/lib/manifest-revalidate";

// Help wanted's writes (owner's pick A, 2026-10-09). Each action: the gate,
// the Zod boundary, the screen's answer to "may they?", then the facade with
// the actor's id alone. Running a team's roles needs at least the team-lead
// rung here; WHICH team (a lead of that team, or a captain) and the Lead role
// (a captain) are checked again inside the write's own transaction, which
// re-reads the actor and never takes a team list from here. "I'm keen" is any
// approved member's, for themselves only: never an id from the form.

const keeperGate = () => captainActionGate("team_lead", HELP_WANTED_REFUSAL);

/** The screen's check: may this actor run `team`'s roles? */
function mayRun(gate: { actor: Actor }, team: string): boolean {
  return roleKeeper(team).allows(gate.actor);
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? CHECK_ROLE;
}

/** Add a role to a team, or change one. */
export async function saveTeamRoleAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("saveTeamRoleAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = SaveTeamRoleInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    if (!mayRun(gate, parsed.data.team)) {
      return { ok: false, error: HELP_WANTED_REFUSAL };
    }
    const result = await saveTeamRole(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidatePath(HELP_WANTED_PATH);
    return { ok: true };
  });
}

/** Remove a role nobody fills. */
export async function removeTeamRoleAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeTeamRoleAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = RemoveTeamRoleInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const result = await removeTeamRole(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidatePath(HELP_WANTED_PATH);
    return { ok: true };
  });
}

/** How many leads a team wants this year. */
export async function setLeadPlacesAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("setLeadPlacesAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = SetLeadPlacesInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    if (!mayRun(gate, parsed.data.team)) {
      return { ok: false, error: HELP_WANTED_REFUSAL };
    }
    const result = await setLeadPlaces(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidatePath(HELP_WANTED_PATH);
    return { ok: true };
  });
}

/** Copy a team's roles from the last year it had any, empty. */
export async function copyLastYearsRolesAction(
  input: unknown,
): Promise<ActionResult<{ copied: number }>> {
  return runAction("copyLastYearsRolesAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = CopyTeamRolesInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    if (!mayRun(gate, parsed.data.team)) {
      return { ok: false, error: HELP_WANTED_REFUSAL };
    }
    const result = await copyLastYearsRoles(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidatePath(HELP_WANTED_PATH);
    return { ok: true, data: { copied: result.copied } };
  });
}

/** The signed-in member presses "I'm keen" on a role, or Undo. */
export async function setKeenAction(input: unknown): Promise<ActionResult> {
  return runAction("setKeenAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = TeamRoleKeenInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const result = await setKeen(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidatePath(HELP_WANTED_PATH);
    return { ok: true };
  });
}

/**
 * Give a role to someone ("Pick someone"). The Lead role is a captain's to
 * give. It may put them on the team, or make them a lead: both are inputs to
 * the desktop, so the acting member's manifest is refreshed.
 */
export async function giveTeamRoleAction(
  input: unknown,
): Promise<ActionResult<{ joinedTeam: boolean; offerLeadPost: boolean }>> {
  return runAction("giveTeamRoleAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = TeamRoleMemberInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const allowed =
      parsed.data.roleId === null
        ? canPickTeamLead(gate.rank)
        : mayRun(gate, parsed.data.team);
    if (!allowed) return { ok: false, error: HELP_WANTED_REFUSAL };
    const result = await giveTeamRole(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidatePath(HELP_WANTED_PATH);
    revalidateManifest();
    return {
      ok: true,
      data: {
        joinedTeam: result.joinedTeam,
        // A new lead: offer Ol' Jeb's post (owner, 2026-10-27).
        offerLeadPost:
          parsed.data.roleId === null && (await mayOfferLeadPost()),
      },
    };
  });
}

/** Take a role back from someone. Lead is a captain's to take. */
export async function takeTeamRoleAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("takeTeamRoleAction", async () => {
    const gate = await keeperGate();
    if (!gate.ok) return gate;
    const parsed = TeamRoleMemberInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: RELOAD };
    const allowed =
      parsed.data.roleId === null
        ? canPickTeamLead(gate.rank)
        : mayRun(gate, parsed.data.team);
    if (!allowed) return { ok: false, error: HELP_WANTED_REFUSAL };
    const result = await takeTeamRole(gate.campUser.id, parsed.data);
    if (!result.ok) return result;
    revalidatePath(HELP_WANTED_PATH);
    revalidateManifest();
    return { ok: true };
  });
}
