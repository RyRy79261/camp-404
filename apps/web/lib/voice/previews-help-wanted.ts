import { canPickTeamLead, roleKeeper } from "@camp404/core";
import { HELP_WANTED_REFUSAL } from "../help-wanted-copy";
import { scopeActor } from "../mcp/scope";
import { boardFor } from "../mcp/tools/help-wanted";
import { readTeamLabels } from "./reads";
import {
  blocked,
  listed,
  personName,
  quote,
  shown,
  str,
  type Args,
  type PreviewCtx,
  type PreviewFn,
} from "./preview-kit";

// Help wanted's voice previews (owner's pick A, 2026-10-09): each reads the
// board as this person sees it on the server, names the role and the team
// from it, and fills in the version the write checks.

const PATH = "/help-wanted";

const roleIdOf = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

/** The team and the role (null: Lead) as the board shows them. */
async function findRole(args: Args, ctx: PreviewCtx) {
  const view = await boardFor(ctx.scope);
  const team = view.teams.find((t) => t.key === str(args.team));
  const roleId = roleIdOf(args.roleId);
  const role = team?.rows.find((r) => r.roleId === roleId);
  return { team, role };
}

const roleKey = (team: string, roleId: string | null) =>
  `team-role:${team}:${roleId ?? "lead"}`;

function mayKeep(ctx: PreviewCtx, team: string): boolean {
  return roleKeeper(team).allows(scopeActor(ctx.scope));
}

async function givePreview(args: Args, ctx: PreviewCtx, give: boolean) {
  const verb = give ? "Give" : "Take";
  const { team, role } = await findRole(args, ctx);
  if (!team || !role) {
    return blocked(
      `${verb} a team role`,
      "That role isn't on Help wanted this year.",
      args,
      PATH,
    );
  }
  const who = await personName(args.userId);
  const allowed = role.isLead
    ? canPickTeamLead(ctx.scope.viewerRank)
    : mayKeep(ctx, team.key);
  const holds = role.people.some((p) => p.userId === str(args.userId));
  const base = {
    sentence: give
      ? `Give ${who} the role ${quote(role.name)} in ${team.label}`
      : `Take the role ${quote(role.name)} in ${team.label} back from ${who}`,
    facts: `Help wanted · ${role.filled} of ${role.places} filled${give && !team.memberIds?.includes(str(args.userId)) ? ` · puts ${who} on ${team.label}` : ""}`,
    path: PATH,
    args: { team: team.key, roleId: role.roleId, userId: str(args.userId) },
    keys: [roleKey(team.key, role.roleId)],
  };
  if (!allowed) {
    return {
      ...base,
      blocked: role.isLead
        ? "Only a captain can pick a team's lead."
        : HELP_WANTED_REFUSAL,
    };
  }
  if (give && holds)
    return { ...base, blocked: "They have this role already." };
  if (give && !role.open) {
    return {
      ...base,
      blocked: "That role is full. Take someone off it first.",
    };
  }
  if (!give && !holds)
    return { ...base, blocked: "They don't have this role." };
  return base;
}

export const HELP_WANTED_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async set_my_keen(args, ctx) {
    const keen = args.keen === true;
    const { team, role } = await findRole(args, ctx);
    if (!team || !role) {
      return blocked(
        keen ? "Say you're keen on a role" : "Take back your keen",
        "That role isn't on Help wanted this year.",
        args,
        PATH,
      );
    }
    const youKeen =
      role.action === "unkeen" ||
      (role.keen ?? []).some((k) => k.userId === ctx.scope.campUserId);
    const base = {
      sentence: keen
        ? `Say you're keen on ${quote(role.name)} in ${team.label}`
        : `Take back that you're keen on ${quote(role.name)} in ${team.label}`,
      facts: `Help wanted · ${role.filled} of ${role.places} filled · the team's lead or a captain picks`,
      path: PATH,
      args: { team: team.key, roleId: role.roleId, keen },
      keys: [`${roleKey(team.key, role.roleId)}:keen`],
    };
    if (keen && youKeen)
      return { ...base, blocked: "You're keen on it already." };
    if (!keen && !youKeen)
      return { ...base, blocked: "You aren't keen on it." };
    if (keen && role.people.some((p) => p.you)) {
      return { ...base, blocked: "You have this role already." };
    }
    if (keen && !role.open)
      return { ...base, blocked: "That role is full now." };
    return base;
  },

  async add_team_role(args, ctx) {
    const labels = await readTeamLabels();
    const team = str(args.team);
    return {
      sentence: `Add the role ${quote(str(args.name))} to ${labels[team] ?? team}`,
      facts: `Help wanted · ${String(args.places)} place${args.places === 1 ? "" : "s"}`,
      ...(args.note ? { change: [`Note: ${shown(args.note)}`] } : {}),
      path: PATH,
      args,
      keys: [],
      ...(mayKeep(ctx, team) ? {} : { blocked: HELP_WANTED_REFUSAL }),
    };
  },

  async update_team_role(args, ctx) {
    const { team, role } = await findRole(args, ctx);
    if (!team || !role || role.isLead) {
      return blocked(
        "Change a team role",
        "That role isn't on Help wanted this year.",
        args,
        PATH,
      );
    }
    const change: string[] = [];
    if (args.name !== undefined) change.push(`Name: ${shown(args.name)}`);
    if (args.places !== undefined) change.push(`Places: ${shown(args.places)}`);
    if (args.note !== undefined) change.push(`Note: ${shown(args.note)}`);
    return {
      sentence: `Change the role ${quote(role.name)} in ${team.label}`,
      facts: `Help wanted · now ${role.places} place${role.places === 1 ? "" : "s"}, ${role.filled} filled`,
      change,
      path: PATH,
      args: { ...args, expectedVersion: role.version },
      keys: [roleKey(team.key, role.roleId)],
      ...(team.manages ? {} : { blocked: HELP_WANTED_REFUSAL }),
    };
  },

  async set_lead_places(args, ctx) {
    const { team, role } = await findRole({ ...args, roleId: null }, ctx);
    if (!team || !role) {
      return blocked(
        "Set how many leads a team wants",
        "That team isn't on Help wanted.",
        args,
        PATH,
      );
    }
    return {
      sentence: `Say ${team.label} wants ${String(args.places)} lead${args.places === 1 ? "" : "s"}`,
      facts: `Help wanted · now ${role.places} wanted, ${role.filled} lead${role.filled === 1 ? "s" : ""} it`,
      path: PATH,
      args: { team: team.key, places: args.places },
      keys: [roleKey(team.key, null)],
      ...(team.manages ? {} : { blocked: HELP_WANTED_REFUSAL }),
    };
  },

  async copy_last_years_roles(args, ctx) {
    const view = await boardFor(ctx.scope);
    const team = view.teams.find((t) => t.key === str(args.team));
    if (!team) {
      return blocked(
        "Copy last year's roles",
        "That team isn't on Help wanted.",
        args,
        PATH,
      );
    }
    const base = {
      sentence: `Copy ${team.label}'s roles from last year, with nobody in them`,
      facts: `Help wanted · ${listed(team.lastYear.map((r) => r.name))}`,
      path: PATH,
      args: { team: team.key },
      keys: [`team-roles:${team.key}`],
    };
    if (!team.manages) return { ...base, blocked: HELP_WANTED_REFUSAL };
    if (team.rows.length > 1) {
      return { ...base, blocked: "This team has roles this year already." };
    }
    if (team.lastYear.length === 0) {
      return { ...base, blocked: "This team had no roles in an earlier year." };
    }
    return base;
  },

  give_team_role: (args, ctx) => givePreview(args, ctx, true),
  take_team_role: (args, ctx) => givePreview(args, ctx, false),
};
