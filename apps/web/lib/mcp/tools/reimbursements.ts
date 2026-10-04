import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as schema from "@camp404/db/schema";
import {
  decideClaim,
  listMyClaims,
  listReimbursementsForReview,
  type ClaimResult,
  type ReimbursementReviewRow,
  type ReimbursementTeam,
} from "@camp404/db/reimbursements";
import { auditReadAfterResponse } from "../../audit";
import { readClaimAccount } from "../../claims";
import { GATES, siteUrl } from "../capabilities";
import {
  deny,
  notFound,
  runTool,
  ToolError,
  truncateList,
} from "../tool-utils";

const TeamEnum = z.enum(schema.teamEnum.enumValues);
const StatusEnum = z.enum(schema.reimbursementStatusEnum.enumValues);

// Claims (#242) over the Claude connector. A claim is MADE in the app only
// (My claims): it needs one or more receipt files, stored privately, which a
// tool call cannot carry, so there is no submit tool. A member lists their
// own; a lead of a team or a captain lists and decides the claims of that
// team. Paying a claim back, marking it reconciled and setting budgets are
// website-only (owner, 2026-10-04: money moves on the page). Every decision is
// checked again inside the database's own transaction (decideClaim): the
// tool's checks here only word a refusal early. Nobody decides their own claim.
//
// Bank details are never in a list. The Finance team reads one claim's at a
// time (get_claim_bank_details), the website's readClaimAccountAction: the
// same gate (captains and Finance leads) and the same
// `reimbursement.account_viewed` row after the response.

const CLAIMS_PAGE = "/captains/payments/claims";

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

/** A claim as a reviewer reads it in a list: never its bank details. */
function presentForReview(row: ReimbursementReviewRow) {
  const {
    accountDetailsEncrypted: _account,
    submitterAiDataConsent: _consent,
    ...rest
  } = row;
  return rest;
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
      "A lead of the claim's team, or a captain, says yes to a waiting claim, at any amount. Nobody decides their own claim. Paying it back is done on the website.",
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
};

function registerReviewTools(server: McpServer): void {
  server.registerTool(
    "list_reimbursements",
    {
      title: "List claims to review",
      description:
        'A captain or a Finance lead gets every claim; a team lead gets the claims of teams they lead this year. Filter by status, or by team ("general" for old claims under no team). Amounts are whole rand cents. No bank details: the Finance team reads one claim\'s with get_claim_bank_details.',
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
          const everything = scope.isCaptain || GATES.money.allows(scope);
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
          return truncateList(rows.map(presentForReview));
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

  server.registerTool(
    "get_claim_bank_details",
    {
      title: "Read one claim's bank details",
      description:
        "The bank details on one claim, to pay it back, as the Finance tools' \"Show bank details\" button gives them. Each read of someone else's is recorded with your name. Only for a member who has allowed it through Claude (their AI data consent); otherwise open the claim on the website. Marking it paid is done on the website.",
      inputSchema: { claimId: z.string().uuid() },
    },
    async (args, extra) =>
      runTool({
        toolName: "get_claim_bank_details",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const account = await readClaimAccount(args.claimId);
          if (!account) notFound("That claim isn't there any more.");
          const own = account.submitterId === scope.campUserId;
          if (!own) {
            const [row] = await listReimbursementsForReview({
              id: args.claimId,
            });
            if (!row?.submitterAiDataConsent) {
              throw new ToolError(
                `This member hasn't allowed their bank details to be read through Claude. Open the claim on the website instead: ${siteUrl(CLAIMS_PAGE)}`,
              );
            }
          }
          if (account.details.state === "unreadable") {
            throw new ToolError(
              "These bank details can't be read with this site's key. Ask the member for them again.",
            );
          }
          if (account.details.state === "absent") {
            throw new ToolError(
              "No bank details are on file: the member's account was erased.",
            );
          }
          // Recorded only when details are actually shown: an unreadable or
          // erased value discloses nothing (the member panel's rule).
          if (!own) {
            auditReadAfterResponse({
              actorId: scope.campUserId,
              action: "reimbursement.account_viewed",
              target: account.submitterId,
              metadata: {
                reimbursementId: args.claimId,
                team: account.team,
                via: "mcp",
              },
            });
          }
          return {
            claimId: args.claimId,
            accountType: account.accountType,
            details: account.details.value,
          };
        },
      }),
  );
}
