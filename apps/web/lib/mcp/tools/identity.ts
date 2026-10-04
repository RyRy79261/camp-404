import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import { listOptionalForms } from "@/lib/forms";
import { capabilitiesFor, siteUrl } from "../capabilities";
import { runTool } from "../tool-utils";

export function registerIdentityTools(server: McpServer): void {
  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Returns your id, stored rank (captain or member), your rung on the ladder (member, team lead or captain), this year's teams and the ones you lead, whether you drive this year, and your AI data consent. For what you may do, call what_can_i_do.",
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
          viewerRank: scope.viewerRank,
          isCaptain: scope.isCaptain,
          isDriver: scope.isDriver,
          memberTeams: scope.memberTeams,
          leadTeams: scope.leadTeams,
          aiDataConsent: scope.aiDataConsent,
        }),
      }),
  );

  server.registerTool(
    "what_can_i_do",
    {
      title: "What can I do here?",
      description:
        "Call this first. For the signed-in person: their rank, the teams they lead this year, area by area the tools they may call (one line each), and what they may do only on the website, with why and the page's full address to send them to.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "what_can_i_do",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const labels = teamLabelMap(await getTeamsConfig());
          const team = (key: string) => ({ key, label: labels[key] ?? key });
          const { rank, rankLabel, areas } = capabilitiesFor(scope);
          return {
            you: {
              rank,
              rankLabel,
              leadsTeams: scope.leadTeams.map(team),
              teams: scope.memberTeams.map(team),
              drivingThisYear: scope.isDriver,
            },
            ladder:
              "member < team lead < captain. Leading any team this year makes you a team lead everywhere; the team you lead decides who you can address, not what you can see.",
            areas,
            otherPages: siteUrl("/"),
          };
        },
      }),
  );

  server.registerTool(
    "list_my_required_actions",
    {
      title: "List my required actions",
      description:
        "Your waiting forms and steps (`required`: blocking ones first must be done before the app lets you in), and the open optional questionnaires anyone may answer (`optional`, each marked optional: nobody has to). Answer a questionnaire in the app at the link given.",
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
          // My forms' Optional section (#347): open opt-in questionnaires this
          // member has not answered. No required_actions row exists for them.
          const optional = await listOptionalForms(scope.campUserId);
          return {
            count: rows.length,
            rows,
            optional: optional.map((form) => ({
              optional: true,
              activationId: form.activationId,
              title: form.title,
              description: form.description,
              started: form.started,
              url: siteUrl(`/questionnaires/${form.activationId}`),
            })),
          };
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
