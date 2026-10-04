import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import { currentCycleNumber } from "@camp404/db/cycles";
import * as schema from "@camp404/db/schema";
import { appendAuditEvent, type AuditEvent } from "@camp404/db/audit";
import { decryptField } from "@camp404/db/crypto";
import { canReadMemberField, safetyReadBasis } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { auditReadsAfterResponse } from "../../audit";
import { membersVisibleTo } from "../../camp-roster";
import { siteUrl } from "../capabilities";
import { canSeeIdDocuments } from "../consent";
import { notFound, runTool, ToolError, truncateList } from "../tool-utils";

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
//  - An ID number is one member at a time, captains only, through
//    get_member_id_number: the read is recorded BEFORE the number is returned
//    and the call fails if the record cannot be written (the member export's
//    rule, stricter than the panel's after-the-response record). It also needs
//    the member's own AI data consent. Nobody else's bank details are offered
//    here at all: the website shows them to no one.

const ID_PANEL = "/captains/camp-management";

export function registerPeopleTools(server: McpServer): void {
  server.registerTool(
    "list_users",
    {
      title: "List camp users",
      description:
        "The camp roster, as the roster page shows it to you: names, rank, this year's teams and leads, and whether someone is still waiting for approval. Captains also get the captain columns. Declined sign-ups are listed for captains only. No emergency contacts, ID numbers or bank details: read one person with get_user.",
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

  server.registerTool(
    "get_member_id_number",
    {
      title: "Read one member's ID number",
      description:
        "One member's ID number (passport or SA ID), as the member panel shows it, for matching tickets to ID. Recorded in the audit log BEFORE it is shown; if the record can't be written, nothing is shown. Only for a member who has allowed it through Claude (their AI data consent); otherwise use the member panel on the website. Never read IDs in bulk.",
      inputSchema: { userId: z.string().uuid() },
    },
    async (args, extra) =>
      runTool({
        toolName: "get_member_id_number",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const [row] = await createHttpDb()
            .select({
              id: schema.users.id,
              passportEncrypted: schema.users.passportEncrypted,
              saIdEncrypted: schema.users.saIdEncrypted,
              aiDataConsent: schema.users.aiDataConsent,
              isSystem: schema.users.isSystem,
            })
            .from(schema.users)
            .where(eq(schema.users.id, args.userId))
            .limit(1);
          if (!row || row.isSystem) notFound("No member with that id.");
          if (!canSeeIdDocuments(scope, row)) {
            throw new ToolError(
              `This member hasn't allowed their ID number to be read through Claude. Open their panel on the website instead: ${siteUrl(ID_PANEL)}`,
            );
          }
          // The panel's read: one document, passport first.
          const passport = decryptField(row.passportEncrypted);
          const saId = decryptField(row.saIdEncrypted);
          const readable =
            passport.state === "ok"
              ? { idType: "passport" as const, idNumber: passport.value }
              : saId.state === "ok"
                ? { idType: "sa_id" as const, idNumber: saId.value }
                : null;
          if (!readable) {
            const unreadable =
              passport.state === "unreadable" || saId.state === "unreadable";
            return {
              idType: null,
              idNumber: null,
              note: unreadable
                ? "An ID number is on file but can't be read with this site's key. Ask the member for it again."
                : "No ID number is on file for this member.",
            };
          }
          if (row.id !== scope.campUserId) {
            try {
              await appendAuditEvent({
                actorId: scope.campUserId,
                action: "member.id_document.viewed",
                target: row.id,
                metadata: {
                  basis: "captain",
                  via: "mcp",
                  idType: readable.idType,
                },
              });
            } catch (error) {
              console.error(
                "audit write failed: member.id_document.viewed",
                error,
              );
              throw new ToolError(
                "The read couldn't be recorded, so the ID number isn't shown. Try again in a moment.",
              );
            }
          }
          return readable;
        },
      }),
  );
}

/**
 * The `users` columns these tools offer, in output order. Whether a caller gets
 * each one is `canReadMemberField` (the app's one field-access list), never a
 * rule written here. The ID and bank columns are not in this list: no list or
 * profile read returns them (get_member_id_number is the one path).
 */
const USER_FIELDS = [
  "id",
  "displayName",
  "rank",
  "isSystem",
  "sanitised",
  "lostCatNumber",
  "approvalStatus",
  "membershipTier",
  "duesPaid",
  "duesPaidAt",
  "skills",
  "previousAfrikaburns",
  "previousBurningMans",
  "firstTime",
  "aiDataConsent",
  "aiDataConsentAt",
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
