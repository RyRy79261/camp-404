import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import { currentCycleNumber } from "@camp404/db/cycles";
import * as schema from "@camp404/db/schema";
import type { AuditEvent } from "@camp404/db/audit";
import { decryptField } from "@camp404/db/crypto";
import { canReadMemberField } from "@camp404/core";
import { auditReadsAfterResponse } from "../../audit";
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

          // THIS YEAR's memberships. Team membership is year-scoped, so an
          // unscoped read would list a member on every team they have ever
          // been on, and `team` / `isLead` filters would match on last year.
          const memberships = await db
            .select()
            .from(schema.teamMemberships)
            .where(eq(schema.teamMemberships.cycle, await currentCycleNumber()));
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

          const listed = truncateList(shaped);
          // The same trail the app leaves: one row per member whose private
          // data this call returned.
          auditReadsAfterResponse(
            listed.rows.flatMap((user) => sensitiveReadEvents(user, scope)),
          );
          return listed;
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
            .where(
              and(
                eq(schema.teamMemberships.userId, args.userId),
                eq(schema.teamMemberships.cycle, await currentCycleNumber()),
              ),
            );
          const user = shapeUser(row, memberships, scope);
          auditReadsAfterResponse(sensitiveReadEvents(user, scope));
          return user;
        },
      }),
  );
}

/**
 * The `users` columns these tools offer, in output order. Whether a caller gets
 * each one is `canReadMemberField` (the app's one field-access list), never a
 * rule written here. The ID documents are not in this list: they also need the
 * subject's consent, below.
 */
const USER_FIELDS = [
  "id",
  "displayName",
  "rank",
  "isSystem",
  "sanitised",
  "lostCatNumber",
  "membershipTier",
  "duesPaid",
  "duesPaidAt",
  "skills",
  "previousAfrikaburns",
  "previousBurningMans",
  "firstTime",
  "emergencyContacts",
  "aiDataConsent",
  "aiDataConsentAt",
  "createdAt",
] as const satisfies readonly (keyof typeof schema.users.$inferSelect)[];

export function shapeUser(
  row: typeof schema.users.$inferSelect,
  memberships: { team: string; isLead: boolean }[],
  scope: { campUserId: string; isCaptain: boolean },
) {
  // MCP knows captain or not, so a team lead reads here as a member. That is
  // the narrower rung, so it can only withhold, never over-share.
  const viewer = {
    rank: scope.isCaptain ? ("captain" as const) : ("camp_member" as const),
    isSelf: row.id === scope.campUserId,
  };
  const extended: Record<string, unknown> = {};
  for (const field of USER_FIELDS) {
    if (canReadMemberField(viewer, `users.${field}`)) {
      extended[field] = row[field];
    }
  }
  if (canReadMemberField(viewer, "teamMemberships.team")) {
    extended.memberships = memberships;
  }
  if (canReadMemberField(viewer, "teamMemberships.isLead")) {
    extended.isLead = memberships.some((m) => m.isLead);
  }

  if (
    canSeeIdDocuments(scope, { id: row.id, aiDataConsent: row.aiDataConsent })
  ) {
    const passport = decryptField(row.passportEncrypted);
    const saId = decryptField(row.saIdEncrypted);
    const eft = decryptField(row.eftDetailsEncrypted);
    return {
      ...extended,
      passport: passport.value,
      saId: saId.value,
      eft: eft.value,
      // On file but undecryptable here — never report these as "not provided".
      unreadableFields: [
        ...(passport.state === "unreadable" ? ["passport"] : []),
        ...(saId.state === "unreadable" ? ["saId"] : []),
        ...(eft.state === "unreadable" ? ["eft"] : []),
      ],
    };
  }
  return extended;
}

/**
 * The audit rows one shaped user owes, the same ones the app writes when a
 * captain reads someone else's emergency contacts or ID. Only values actually
 * returned count, and a caller reading their own record owes none. Marked
 * `via: "mcp"` so the audit page can say the read went through Claude.
 */
export function sensitiveReadEvents(
  user: Record<string, unknown>,
  scope: { campUserId: string },
): AuditEvent[] {
  const target = typeof user.id === "string" ? user.id : null;
  if (!target || target === scope.campUserId) return [];
  const read = (action: AuditEvent["action"], extra = {}): AuditEvent => ({
    actorId: scope.campUserId,
    action,
    target,
    metadata: { basis: "captain", via: "mcp", ...extra },
  });
  const events: AuditEvent[] = [];
  if (
    Array.isArray(user.emergencyContacts) &&
    user.emergencyContacts.length > 0
  ) {
    events.push(read("safety.emergency_contacts.view"));
  }
  if (typeof user.passport === "string") {
    events.push(read("member.id_document.viewed", { idType: "passport" }));
  }
  if (typeof user.saId === "string") {
    events.push(read("member.id_document.viewed", { idType: "sa_id" }));
  }
  if (typeof user.eft === "string") {
    events.push(read("member.bank_details.viewed"));
  }
  return events;
}
