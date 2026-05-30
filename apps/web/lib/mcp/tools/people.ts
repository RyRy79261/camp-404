import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { decryptOrNull } from "@camp404/db/crypto";
import { canSeeIdDocuments } from "../consent";
import { notFound, runTool, truncateList } from "../tool-utils";

const RankEnum = z.enum(schema.rankEnum.enumValues);
const TeamEnum = z.enum(schema.teamEnum.enumValues);

export function registerPeopleTools(server: McpServer): void {
  server.registerTool(
    "list_users",
    {
      title: "List camp users",
      description:
        "Camp-wide directory. Every user sees displayName, rank, team memberships, isLead status. Captain callers additionally see extended fields and (consent-permitting) ID documents.",
      inputSchema: {
        team: TeamEnum.optional(),
        rank: RankEnum.optional(),
        isLead: z.boolean().optional(),
        includeSystem: z.boolean().optional().default(false),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_users",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          let rows = await db.select().from(schema.users);
          if (!args.includeSystem) rows = rows.filter((r) => !r.isSystem);
          if (args.rank) rows = rows.filter((r) => r.rank === args.rank);

          const memberships = await db.select().from(schema.teamMemberships);
          const byUser = new Map<
            string,
            { team: typeof schema.teamMemberships.$inferSelect.team; isLead: boolean }[]
          >();
          for (const m of memberships) {
            if (!byUser.has(m.userId)) byUser.set(m.userId, []);
            byUser.get(m.userId)!.push({ team: m.team, isLead: m.isLead });
          }

          const shaped = rows
            .filter((r) => {
              if (!args.team && args.isLead === undefined) return true;
              const ms = byUser.get(r.id) ?? [];
              if (args.team && !ms.some((m) => m.team === args.team)) return false;
              if (args.isLead !== undefined && !ms.some((m) => m.isLead === args.isLead)) {
                return false;
              }
              return true;
            })
            .map((r) => shapeUser(r, byUser.get(r.id) ?? [], scope));

          return truncateList(shaped);
        },
      }),
  );

  server.registerTool(
    "get_user",
    {
      title: "Get one user",
      description:
        "Returns one user's full profile. Encrypted ID-document fields are only included when the caller is the subject, or a captain AND the subject has aiDataConsent = true.",
      inputSchema: { userId: z.string().uuid() },
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
          if (!row) notFound("No user with that id.");
          const memberships = await db
            .select({
              team: schema.teamMemberships.team,
              isLead: schema.teamMemberships.isLead,
            })
            .from(schema.teamMemberships)
            .where(eq(schema.teamMemberships.userId, args.userId));
          return shapeUser(row, memberships, scope);
        },
      }),
  );
}

function shapeUser(
  row: typeof schema.users.$inferSelect,
  memberships: { team: string; isLead: boolean }[],
  scope: { campUserId: string; isCaptain: boolean },
) {
  const isSelf = row.id === scope.campUserId;
  const base = {
    id: row.id,
    displayName: row.displayName,
    rank: row.rank,
    isSystem: row.isSystem,
    sanitised: row.sanitised,
    lostCatNumber: row.lostCatNumber,
    memberships,
    isLead: memberships.some((m) => m.isLead),
  };
  if (!isSelf && !scope.isCaptain) return base;

  const extended = {
    ...base,
    membershipTier: row.membershipTier,
    duesPaid: row.duesPaid,
    duesPaidAt: row.duesPaidAt,
    skills: row.skills,
    previousAfrikaburns: row.previousAfrikaburns,
    previousBurningMans: row.previousBurningMans,
    firstTime: row.firstTime,
    emergencyContacts: row.emergencyContacts,
    aiDataConsent: row.aiDataConsent,
    aiDataConsentAt: row.aiDataConsentAt,
    createdAt: row.createdAt,
  };

  if (
    canSeeIdDocuments(
      { ...scope, rank: scope.isCaptain ? "captain" : "member" } as never,
      { id: row.id, aiDataConsent: row.aiDataConsent },
    )
  ) {
    return {
      ...extended,
      passport: decryptOrNull(row.passportEncrypted),
      saId: decryptOrNull(row.saIdEncrypted),
      eft: decryptOrNull(row.eftDetailsEncrypted),
    };
  }
  return extended;
}
