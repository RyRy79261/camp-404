import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { runTool, ToolError } from "../tool-utils";

export function registerIdentityTools(server: McpServer): void {
  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Returns the current camp user's identity and capability snapshot — rank (captain or member), team memberships, which of those they lead, whether they have registered intent to drive, and their AI-data-consent flag. The first tool to call in a session.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "whoami",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => ({
          campUserId: scope.campUserId,
          rank: scope.rank,
          isCaptain: scope.isCaptain,
          isDriver: scope.isDriver,
          memberTeams: scope.memberTeams,
          leadTeams: scope.leadTeams,
          aiDataConsent: scope.aiDataConsent,
        }),
      }),
  );

  server.registerTool(
    "list_my_required_actions",
    {
      title: "List my required actions",
      description:
        "Returns every required_actions row blocking or pending for the current user — questionnaires they must complete, payments they owe, terms they must acknowledge, etc.",
      inputSchema: {
        includeCompleted: z.boolean().optional().default(false),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_my_required_actions",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const rows = await db
            .select()
            .from(schema.requiredActions)
            .where(
              args.includeCompleted
                ? eq(schema.requiredActions.userId, scope.campUserId)
                : and(
                    eq(schema.requiredActions.userId, scope.campUserId),
                    eq(schema.requiredActions.status, "pending"),
                  ),
            )
            .orderBy(desc(schema.requiredActions.createdAt));
          return { count: rows.length, rows };
        },
      }),
  );

  server.registerTool(
    "complete_acknowledgement",
    {
      title: "Complete an acknowledgement",
      description:
        "Marks an acknowledgement-type required action as completed (e.g. T&Cs read). Questionnaires and payments are not completable here — those must go through their bespoke web flow because they need to write their domain table too.",
      inputSchema: {
        actionKey: z
          .string()
          .min(1)
          .describe(
            "The `action_key` of the pending acknowledgement (see list_my_required_actions).",
          ),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "complete_acknowledgement",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const [row] = await db
            .select()
            .from(schema.requiredActions)
            .where(
              and(
                eq(schema.requiredActions.userId, scope.campUserId),
                eq(schema.requiredActions.actionKey, args.actionKey),
              ),
            )
            .limit(1);
          if (!row) {
            throw new ToolError(`No required action with key '${args.actionKey}'.`);
          }
          if (row.type !== "acknowledgement") {
            throw new ToolError(
              `Required action '${args.actionKey}' is of type '${row.type}', which can only be completed via the bespoke web flow.`,
            );
          }
          if (row.status !== "pending") {
            throw new ToolError(
              `Required action is already ${row.status}.`,
            );
          }
          const [updated] = await db
            .update(schema.requiredActions)
            .set({ status: "completed", completedAt: new Date() })
            .where(eq(schema.requiredActions.id, row.id))
            .returning();
          return updated;
        },
      }),
  );

  server.registerTool(
    "get_my_ai_consent",
    {
      title: "Get my AI-data consent flag",
      description:
        "Returns whether the current user has opted into having their ID documents (passport, SA ID, EFT bank details) surfaced to *other* users' AI/MCP sessions. Doesn't affect what the user sees about themselves.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_ai_consent",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const [row] = await db
            .select({
              enabled: schema.users.aiDataConsent,
              since: schema.users.aiDataConsentAt,
            })
            .from(schema.users)
            .where(eq(schema.users.id, scope.campUserId))
            .limit(1);
          return row ?? { enabled: false, since: null };
        },
      }),
  );

  server.registerTool(
    "set_my_ai_consent",
    {
      title: "Set my AI-data consent flag",
      description:
        "Toggle the user's opt-in for surfacing their ID documents to other users' AI/MCP sessions. Setting `true` records a `since` timestamp; setting `false` clears it. Default is opt-out.",
      inputSchema: {
        enabled: z.boolean(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "set_my_ai_consent",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const [row] = await db
            .update(schema.users)
            .set({
              aiDataConsent: args.enabled,
              aiDataConsentAt: args.enabled ? new Date() : null,
            })
            .where(eq(schema.users.id, scope.campUserId))
            .returning({
              enabled: schema.users.aiDataConsent,
              since: schema.users.aiDataConsentAt,
            });
          return row;
        },
      }),
  );
}
