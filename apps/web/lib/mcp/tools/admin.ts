import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import {
  auditActionLabel,
  auditDetail,
  inviteCodeState,
  isSyntacticallyValidCode,
  normalizeInviteCode,
} from "@camp404/core";
import { createHttpDb } from "@camp404/db";
import { isAuditCursor, listAuditLog } from "@camp404/db/audit";
import {
  findInviteCodeByCode,
  listInviteCodes,
  revokeInviteCode,
} from "@camp404/db/invite-codes";
import * as schema from "@camp404/db/schema";
import {
  assignTeam,
  getTeamMemberships,
  removeTeam,
  setLead,
} from "@camp404/db/team-memberships";
import { auditTarget } from "@/lib/audit-format";
import { getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import { resolveTeamKey } from "@/lib/team-keys";
import { canAdmin } from "../scope";
import {
  deny,
  notFound,
  runTool,
  ToolError,
  type ToolCtx,
} from "../tool-utils";

// Captain-tier admin tools (docs/mcp-tooling-proposal.md phases 7-8): team
// membership writes, invite codes, and the audit log. Each write calls the
// same @camp404/db helper the web app calls, so the rules and the audit_log
// row are the app's own; runTool adds the mcp_audit_log row. Scope is read
// fresh on every call, so a captain who loses the rank loses these at once.

const UserId = z.string().uuid();

function requireCaptain(ctx: ToolCtx): void {
  if (!canAdmin(ctx.scope)) deny("Only a captain can do this.");
}

/** A real, active member row, or a controlled "not found". */
async function requireMember(userId: string): Promise<void> {
  const [row] = await createHttpDb()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
      ),
    )
    .limit(1);
  if (!row) notFound("No member with that id.");
}

async function teamKey(team: string, requireActive: boolean) {
  const resolved = await resolveTeamKey(team, requireActive);
  if (!resolved.ok) throw new ToolError(resolved.error);
  return resolved.team;
}

export function registerAdminTools(server: McpServer): void {
  server.registerTool(
    "assign_team_membership",
    {
      title: "Put a member on a team",
      description:
        "Captain only. Puts a member on an active team for the camp's current year, not leading. Doing it twice changes nothing.",
      inputSchema: { userId: UserId, team: z.string() },
    },
    async (args, extra) =>
      runTool({
        toolName: "assign_team_membership",
        extra,
        argsForAudit: args,
        handler: async (ctx) => {
          requireCaptain(ctx);
          const team = await teamKey(args.team, true);
          await requireMember(args.userId);
          const { created } = await assignTeam({
            userId: args.userId,
            team,
            actorId: ctx.scope.campUserId,
          });
          return {
            created,
            teams: await getTeamMemberships(args.userId),
          };
        },
      }),
  );

  server.registerTool(
    "remove_team_membership",
    {
      title: "Take a member off a team",
      description:
        "Captain only. Takes a member off a team for the camp's current year. Works for an archived team too. Removing a team's last lead is allowed.",
      inputSchema: { userId: UserId, team: z.string() },
    },
    async (args, extra) =>
      runTool({
        toolName: "remove_team_membership",
        extra,
        argsForAudit: args,
        handler: async (ctx) => {
          requireCaptain(ctx);
          const team = await teamKey(args.team, false);
          await requireMember(args.userId);
          const { removed } = await removeTeam({
            userId: args.userId,
            team,
            actorId: ctx.scope.campUserId,
          });
          return {
            removed,
            teams: await getTeamMemberships(args.userId),
          };
        },
      }),
  );

  server.registerTool(
    "set_team_lead",
    {
      title: "Make a member lead a team, or stop leading it",
      description:
        "Captain only. Sets or clears the lead flag on a member's membership of an active team this year. The member must already be on the team.",
      inputSchema: { userId: UserId, team: z.string(), isLead: z.boolean() },
    },
    async (args, extra) =>
      runTool({
        toolName: "set_team_lead",
        extra,
        argsForAudit: args,
        handler: async (ctx) => {
          requireCaptain(ctx);
          const team = await teamKey(args.team, true);
          await requireMember(args.userId);
          const result = await setLead({
            userId: args.userId,
            team,
            isLead: args.isLead,
            actorId: ctx.scope.campUserId,
          });
          if (!result.ok) throw new ToolError("Add them to the team first.");
          return {
            changed: result.changed,
            teams: await getTeamMemberships(args.userId),
          };
        },
      }),
  );

  server.registerTool(
    "list_invite_codes",
    {
      title: "List invite codes",
      description:
        "A captain gets every invite code; anyone else gets the codes they made. Newest first, with each code's state (active, used_up, expired or revoked).",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_invite_codes",
        extra,
        argsForAudit: null,
        handler: async (ctx) => {
          const codes = await listInviteCodes(
            canAdmin(ctx.scope)
              ? {}
              : { createdByUserId: ctx.scope.campUserId },
          );
          const now = new Date();
          return codes.map((code) => ({
            code: code.code,
            state: inviteCodeState(code, now),
            createdByName: code.createdByName,
            note: code.note,
            useCount: code.useCount,
            maxUses: code.maxUses,
            expiresAt: code.expiresAt,
            requiresApproval: code.requiresApproval,
            invitedEmail: code.invitedEmail,
            createdAt: code.createdAt,
          }));
        },
      }),
  );

  server.registerTool(
    "revoke_invite_code",
    {
      title: "Revoke an invite code",
      description:
        "Stops a code letting anyone else join. People who already joined keep their place. A captain may revoke any code; anyone else only the codes they made.",
      inputSchema: { code: z.string() },
    },
    async (args, extra) =>
      runTool({
        toolName: "revoke_invite_code",
        extra,
        argsForAudit: args,
        handler: async (ctx) => {
          const code = normalizeInviteCode(args.code);
          if (!isSyntacticallyValidCode(code)) {
            throw new ToolError("That isn't an invite code.");
          }
          const isCaptain = canAdmin(ctx.scope);
          const revoked = await revokeInviteCode({
            code,
            actorUserId: ctx.scope.campUserId,
            createdByUserId: isCaptain ? undefined : ctx.scope.campUserId,
          });
          if (revoked) return { revoked: true };
          // The write refuses all three alike; say which it was.
          const existing = await findInviteCodeByCode(code);
          if (!existing) notFound("That code doesn't exist.");
          if (existing.revokedAt) {
            throw new ToolError("That code is already revoked.");
          }
          deny(
            "Only the person who made this code, or a captain, can revoke it.",
          );
        },
      }),
  );

  server.registerTool(
    "list_audit_log",
    {
      title: "Read the audit log",
      description:
        "Captain only. Who changed or read whose data, newest first, 50 entries a page. Pass the returned nextCursor as `before` for older entries.",
      inputSchema: {
        before: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_audit_log",
        extra,
        argsForAudit: args,
        handler: async (ctx) => {
          requireCaptain(ctx);
          if (args.before !== undefined && !isAuditCursor(args.before)) {
            throw new ToolError("That cursor isn't one this tool returned.");
          }
          const [page, teams] = await Promise.all([
            listAuditLog({ before: args.before, limit: args.limit }),
            getTeamsConfig(),
          ]);
          const labels = teamLabelMap(teams);
          const teamLabel = (key: string) => labels[key] ?? key;
          return {
            entries: page.rows.map((row) => ({
              id: row.id,
              action: row.action,
              label: auditActionLabel(row.action),
              actorId: row.actorId,
              actorName: row.actorId
                ? (row.actorName ?? "A removed account")
                : "The app",
              target: row.target,
              about: auditTarget(row, teamLabel),
              detail: auditDetail(row.action, row.metadata, teamLabel),
              at: row.createdAt.toISOString(),
            })),
            nextCursor: page.nextCursor,
          };
        },
      }),
  );
}
