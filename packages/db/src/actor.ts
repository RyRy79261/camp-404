import { and, eq } from "drizzle-orm";
import type { Actor, Rule } from "@camp404/core";
import type { DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import * as schema from "./schema";

// Who is acting, read INSIDE a write's own transaction and held there until it
// commits. See GLOSSARY.md (Actor, Rule) and packages/core/src/actor.ts.
//
// An action reads the actor's rank and led teams first, to answer the screen
// fast. That read is a snapshot. Between it and the write, a captain could
// remove the lead or demote the captain, and a write that trusted the snapshot
// would still act on the old answer (CodeRabbit on #225; owner: "fix it
// now"). So the write asks again here, and `FOR SHARE` holds every row the
// answer rests on: the year (`camp_settings`), the rank (`users`) and the lead
// flags (`team_memberships`). A demotion, a lead removal or a year rollover
// that committed first is what this read sees. One that comes later waits
// until this transaction commits. The check and the write cannot fall out of
// step. A write never takes an actor, or a list of teams, from its caller.
//
// Lock order is camp_settings, then users, then team_memberships. No cycle of
// waits can form, because every other writer of these rows either takes
// camp_settings first (the year rollover) or takes only one of the three
// (`setLead` / `removeTeam` touch team_memberships; `setUserRank` and
// `acceptCaptainPromotion` touch users).
//
// A captain's lead rows are neither read nor locked: no rule asks a captain's
// teams, so their `ledTeams` is empty.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The actor, read and locked inside `tx`: a captain, a lead of the teams they
 * lead this year, or a member (also someone with no account row). Null for an
 * id that is not a UUID, before any row is read: every rule refuses it.
 */
export async function lockActor(
  tx: DbOrTx,
  userId: string,
): Promise<Actor | null> {
  if (!UUID.test(userId)) return null;
  await tx
    .select({ id: schema.campSettings.id })
    .from(schema.campSettings)
    .for("share");
  const cycle = await currentCycleNumber(tx);
  const [user] = await tx
    .select({ rank: schema.users.rank })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .for("share");
  if (user?.rank === "captain") return { rank: "captain", ledTeams: [] };
  const led = await tx
    .select({ team: schema.teamMemberships.team })
    .from(schema.teamMemberships)
    .where(
      and(
        eq(schema.teamMemberships.userId, userId),
        eq(schema.teamMemberships.cycle, cycle),
        eq(schema.teamMemberships.isLead, true),
      ),
    )
    .for("share");
  const ledTeams = led.map((r) => r.team);
  return { rank: ledTeams.length > 0 ? "team_lead" : "camp_member", ledTeams };
}

/** Whether the actor, read and locked inside `tx`, passes `rule`. */
export async function lockAllowed(
  tx: DbOrTx,
  userId: string,
  rule: Rule,
): Promise<boolean> {
  return rule.allows(await lockActor(tx, userId));
}
