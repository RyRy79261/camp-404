import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { canManageMoney } from "@camp404/core";
import * as schema from "@camp404/db/schema";
import { decryptField } from "@camp404/db/crypto";
import {
  decideClaim,
  listMyClaims,
  listReimbursementsForReview,
  payClaim,
  reconcileClaim,
  type ClaimResult,
  type ReimbursementReviewRow,
  type ReimbursementTeam,
} from "@camp404/db/reimbursements";
import type { McpScope } from "../scope";
import { deny, runTool, ToolError, truncateList } from "../tool-utils";

const TeamEnum = z.enum(schema.teamEnum.enumValues);
const StatusEnum = z.enum(schema.reimbursementStatusEnum.enumValues);

// Claims (#242) over the Claude connector. A claim is MADE in the app only
// (My claims): it needs one or more receipt files, stored privately, which a
// tool call cannot carry, so there is no submit tool. A member lists their
// own; a lead of a team or a captain lists and decides the claims of that
// team; the Finance team (captains and Finance leads) marks them paid or
// reconciled. Every move is checked again inside the database's own
// transaction (decideClaim, payClaim, reconcileClaim): the tool's checks here
// only word a refusal early. Nobody moves their own claim.

export function registerReimbursementTools(server: McpServer): void {
  server.registerTool(
    "list_my_reimbursements",
    {
      title: "List my claims",
      description:
        "Returns the current user's own claims, every year, newest first: team, what for, amount in whole rand cents, day paid, status, and the reason if it was not approved. To make a claim, use My claims in the app: a claim needs its receipts.",
      inputSchema: { status: StatusEnum.optional() },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_my_reimbursements",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const rows = await listMyClaims(scope.campUserId);
          return truncateList(
            rows
              .filter((r) => !args.status || r.status === args.status)
              .map(({ files, ...rest }) => ({
                ...rest,
                receiptCount: files.length,
              })),
          );
        },
      }),
  );

  registerReviewTools(server);
}

// --- Review (team leads, captains, the Finance team) ---------------------------

function keepsMoney(scope: McpScope): boolean {
  return canManageMoney(
    scope.isCaptain
      ? "captain"
      : scope.leadTeams.length > 0
        ? "team_lead"
        : "camp_member",
    scope.leadTeams,
  );
}

/**
 * The claim with its bank details only where the caller may see them: the
 * member themselves, or the Finance team when the member's AI data consent
 * is on (the connector's consent gate).
 */
function presentForReview(scope: McpScope, row: ReimbursementReviewRow) {
  const { accountDetailsEncrypted, submitterAiDataConsent, ...rest } = row;
  const own = row.submitterId === scope.campUserId;
  const mayRead = own || (keepsMoney(scope) && submitterAiDataConsent);
  if (!mayRead) {
    return { ...rest, accountDetails: null, accountDetailsWithheld: true };
  }
  const account = decryptField(accountDetailsEncrypted);
  return {
    ...rest,
    accountDetails: account.value,
    accountDetailsWithheld: false,
    accountDetailsUnreadable: account.state === "unreadable",
  };
}

type Move = {
  title: string;
  description: string;
  run: (id: string, actorId: string) => Promise<ClaimResult>;
  to: string;
};

const MOVES: Record<string, Move> = {
  approve_reimbursement: {
    title: "Approve a claim",
    description:
      "A lead of the claim's team, or a captain, says yes to a waiting claim, at any amount. Nobody decides their own claim.",
    run: (claimId, actorId) =>
      decideClaim({ claimId, decision: "approved", actorId }),
    to: "approved",
  },
  reject_reimbursement: {
    title: "Turn down a claim",
    description:
      "A lead of the claim's team, or a captain, says no to a waiting claim. Nobody decides their own claim.",
    run: (claimId, actorId) =>
      decideClaim({ claimId, decision: "rejected", actorId }),
    to: "rejected",
  },
  mark_reimbursement_paid: {
    title: "Mark a claim paid",
    description:
      "A captain or a Finance lead marks an approved claim paid, after paying it back by bank transfer. Nobody pays their own claim.",
    run: (claimId, actorId) => payClaim({ claimId, decision: "paid", actorId }),
    to: "paid",
  },
  mark_reimbursement_reconciled: {
    title: "Mark a claim reconciled",
    description:
      "A captain or a Finance lead marks a paid claim as matched to the bank statement.",
    run: (claimId, actorId) => reconcileClaim({ claimId, actorId }),
    to: "reconciled",
  },
};

function registerReviewTools(server: McpServer): void {
  server.registerTool(
    "list_reimbursements",
    {
      title: "List claims to review",
      description:
        "A captain or a Finance lead gets every claim; a team lead gets the claims of teams they lead this year. Filter by status, or by team (\"general\" for old claims under no team). Amounts are whole rand cents. Someone else's bank details come back only for the Finance team, and only when that member's AI data consent is on.",
      inputSchema: {
        status: StatusEnum.optional(),
        team: z.union([TeamEnum, z.literal("general")]).optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_reimbursements",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const everything = scope.isCaptain || keepsMoney(scope);
          if (!everything && scope.leadTeams.length === 0) {
            deny("Only a captain or a team lead can review claims.");
          }
          let teams: ReimbursementTeam[] | undefined;
          if (!everything) {
            if (args.team === "general") {
              deny("Claims under no team are a captain's to review.");
            }
            teams = args.team
              ? scope.leadTeams.filter((t) => t === args.team)
              : [...scope.leadTeams];
            if (args.team && teams.length === 0) {
              deny("You don't lead that team this year.");
            }
          } else if (args.team && args.team !== "general") {
            teams = [args.team];
          }
          const rows = await listReimbursementsForReview({
            status: args.status,
            teams,
            generalOnly: args.team === "general",
          });
          return truncateList(rows.map((row) => presentForReview(scope, row)));
        },
      }),
  );

  for (const [toolName, move] of Object.entries(MOVES)) {
    server.registerTool(
      toolName,
      {
        title: move.title,
        description: move.description,
        inputSchema: { id: z.string().uuid() },
      },
      async (args, extra) =>
        runTool({
          toolName,
          extra,
          argsForAudit: args,
          handler: async ({ scope }) => {
            const result = await move.run(args.id, scope.campUserId);
            if (!result.ok) throw new ToolError(result.error);
            return { id: args.id, status: move.to };
          },
        }),
    );
  }
}
