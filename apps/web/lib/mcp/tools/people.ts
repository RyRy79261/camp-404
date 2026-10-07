import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import { currentCycleNumber } from "@camp404/db/cycles";
import * as schema from "@camp404/db/schema";
import type { AuditEvent } from "@camp404/db/audit";
import { canReadMemberField, safetyReadBasis } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { auditReadsAfterResponse } from "../../audit";
import { membersVisibleTo } from "../../camp-roster";
import { notFound, runTool, truncateList } from "../tool-utils";

const RankEnum = z.enum(schema.rankEnum.enumValues);
const TeamEnum = z.enum(schema.teamEnum.enumValues);

// People over MCP, the way the website hands them out (owner, 2026-10-04):
//
//  - The roster (list_users) lists whom the roster page lists: a non-captain
//    never sees a declined sign-up (membersVisibleTo, MEMBERS_SEE_REJECTED in
//    lib/camp-roster.ts), and each column comes from canReadMemberField at the
//    caller's real rung, team lead included. It carries no safety data and no
//    ID or bank numbers for anyone: the website never lists those either.
//  - One person (get_user) is the member panel: a team lead or a captain also
//    reads their emergency contacts, and each such read of someone else is
//    recorded, as resolveSafetyDataForViewer records it.
//  - ID numbers and bank details never pass through the connector, for
//    anyone, the member's own included (owner, 2026-10-05: "The agents won't
//    need any access to that kind of information"). They are on the website's
//    audited pages for those who may see them.

export function registerPeopleTools(server: McpServer): void {
  server.registerTool(
    "list_users",
    {
      title: "List camp users",
      description:
        "The camp roster, as the roster page shows it to you: names, rank, this year's teams and leads, and whether someone is still waiting for approval. Captains also get the captain columns. Declined sign-ups are listed for captains only. No emergency contacts (read one person with get_user), and never ID numbers or bank details.",
      inputSchema: z.object({
        team: TeamEnum.optional(),
        rank: RankEnum.optional(),
        isLead: z.boolean().optional(),
        includeSystem: z.boolean().optional().default(false),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "list_users",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          let rows = membersVisibleTo(
            await db.select().from(schema.users),
            scope.isCaptain,
          );
          if (!args.includeSystem) rows = rows.filter((r) => !r.isSystem);
          if (args.rank) rows = rows.filter((r) => r.rank === args.rank);

          // THIS YEAR's memberships. Team membership is year-scoped, so an
          // unscoped read would list a member on every team they have ever
          // been on, and `team` / `isLead` filters would match on last year.
          const memberships = await db
            .select()
            .from(schema.teamMemberships)
            .where(
              eq(schema.teamMemberships.cycle, await currentCycleNumber()),
            );
          const byUser = new Map<
            string,
            {
              team: typeof schema.teamMemberships.$inferSelect.team;
              isLead: boolean;
            }[]
          >();
          for (const m of memberships) {
            if (!byUser.has(m.userId)) byUser.set(m.userId, []);
            byUser.get(m.userId)!.push({ team: m.team, isLead: m.isLead });
          }

          const shaped = rows
            .filter((r) => {
              if (!args.team && args.isLead === undefined) return true;
              const ms = byUser.get(r.id) ?? [];
              if (args.team && !ms.some((m) => m.team === args.team))
                return false;
              if (
                args.isLead !== undefined &&
                !ms.some((m) => m.isLead === args.isLead)
              ) {
                return false;
              }
              return true;
            })
            .map((r) =>
              shapeUser(r, byUser.get(r.id) ?? [], scope, { safety: false }),
            );
          return truncateList(shaped);
        },
      }),
  );

  server.registerTool(
    "get_user",
    {
      title: "Get one user",
      description:
        "One person, with the columns your rank may read: what the roster shows for a member; team leads and captains also get their emergency contacts (safety data: read it only when needed, and every read of someone else's is recorded with your name); captains also get the captain columns. Never an ID number or bank details. A non-captain can't open a declined sign-up.",
      inputSchema: z.object({ userId: z.string().uuid() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_user",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const [row] = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, args.userId))
            .limit(1);
          // A declined sign-up is not on a non-captain's roster, so it is
          // "no user" here too, never a refusal that confirms they applied.
          if (!row || membersVisibleTo([row], scope.isCaptain).length === 0) {
            notFound("No user with that id.");
          }
          const memberships = await db
            .select({
              team: schema.teamMemberships.team,
              isLead: schema.teamMemberships.isLead,
            })
            .from(schema.teamMemberships)
            .where(
              and(
                eq(schema.teamMemberships.userId, args.userId),
                eq(schema.teamMemberships.cycle, await currentCycleNumber()),
              ),
            );
          const user = shapeUser(row, memberships, scope, { safety: true });
          auditReadsAfterResponse(sensitiveReadEvents(user, scope));
          return user;
        },
      }),
  );
}

/**
 * The `users` columns these tools offer, in output order. Whether a caller gets
 * each one is `canReadMemberField` (the app's one field-access list), never a
 * rule written here. The ID and bank columns (ALWAYS_PRIVATE) are not in this
 * list and never will be: the connector has no path to them.
 */
const USER_FIELDS = [
  "id",
  "displayName",
  "rank",
  "isSystem",
  "sanitised",
  "lostCatNumber",
  "approvalStatus",
  "duesPaid",
  "duesPaidAt",
  "skills",
  "previousAfrikaburns",
  "previousBurningMans",
  "firstTime",
  "createdAt",
] as const satisfies readonly (keyof typeof schema.users.$inferSelect)[];

/** Safety columns: only on a one-person read, never in a list. */
const SAFETY_FIELDS = [
  "emergencyContacts",
] as const satisfies readonly (keyof typeof schema.users.$inferSelect)[];

export function shapeUser(
  row: typeof schema.users.$inferSelect,
  memberships: { team: string; isLead: boolean }[],
  scope: { campUserId: string; viewerRank: ViewerRank },
  options: { safety: boolean },
): Record<string, unknown> {
  // The caller's real rung: a team lead reads what a team lead reads on the
  // website (emergency contacts included), never less and never more.
  const viewer = {
    rank: scope.viewerRank,
    isSelf: row.id === scope.campUserId,
  };
  const shaped: Record<string, unknown> = {};
  const fields = options.safety
    ? [...USER_FIELDS, ...SAFETY_FIELDS]
    : USER_FIELDS;
  for (const field of fields) {
    if (canReadMemberField(viewer, `users.${field}`)) {
      shaped[field] = row[field];
    }
  }
  if (canReadMemberField(viewer, "teamMemberships.team")) {
    shaped.memberships = memberships;
  }
  if (canReadMemberField(viewer, "teamMemberships.isLead")) {
    shaped.isLead = memberships.some((m) => m.isLead);
  }
  return shaped;
}

/**
 * The audit rows one shaped user owes: the website's emergency-contacts read
 * record (`safety.emergency_contacts.view`, basis from safetyReadBasis) when
 * contacts of someone else were returned. Marked `via: "mcp"` so the audit
 * page can say the read went through Claude.
 */
export function sensitiveReadEvents(
  user: Record<string, unknown>,
  scope: { campUserId: string; viewerRank: ViewerRank },
): AuditEvent[] {
  const target = typeof user.id === "string" ? user.id : null;
  if (!target || target === scope.campUserId) return [];
  const basis = safetyReadBasis({ rank: scope.viewerRank, isSelf: false });
  if (
    basis &&
    Array.isArray(user.emergencyContacts) &&
    user.emergencyContacts.length > 0
  ) {
    return [
      {
        actorId: scope.campUserId,
        action: "safety.emergency_contacts.view",
        target,
        metadata: { basis, via: "mcp" },
      },
    ];
  }
  return [];
}
