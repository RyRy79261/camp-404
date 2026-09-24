import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { Currency } from "@camp404/types";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { decryptField, encrypt } from "@camp404/db/crypto";
import {
  getReimbursementForReview,
  listReimbursementsForReview,
  moveReimbursement,
  submitReimbursement,
  type ReimbursementReviewRow,
  type ReimbursementStatus,
  type ReimbursementTeam,
} from "@camp404/db/reimbursements";
import type { McpScope } from "../scope";
import {
  deny,
  notFound,
  runTool,
  ToolError,
  truncateList,
} from "../tool-utils";

const TeamEnum = z.enum(schema.teamEnum.enumValues);
const StatusEnum = z.enum(schema.reimbursementStatusEnum.enumValues);
const AccountTypeEnum = z.enum(schema.reimbursementAccountTypeEnum.enumValues);

export function registerReimbursementTools(server: McpServer): void {
  server.registerTool(
    "submit_reimbursement",
    {
      title: "Submit a reimbursement",
      description:
        "Any camp user can submit an out-of-pocket expense. Account details are encrypted on write — the plaintext value is never persisted.",
      inputSchema: {
        team: TeamEnum.nullable().optional(),
        amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        currency: Currency,
        accountType: AccountTypeEnum,
        accountDetails: z
          .string()
          .min(1)
          .describe(
            "Account number + bank / SWIFT or international equivalent.",
          ),
        description: z.string().min(1),
        receiptBlobUrl: z.string().url().nullable().optional(),
        itemPhotoBlobUrl: z.string().url().nullable().optional(),
        voiceMemoBlobUrl: z.string().url().nullable().optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "submit_reimbursement",
        extra,
        argsForAudit: {
          team: args.team ?? "general",
          amount: args.amount,
          currency: args.currency,
        },
        handler: async ({ scope }) => {
          if (!args.receiptBlobUrl && !args.itemPhotoBlobUrl) {
            throw new Error(
              "At least one of receipt or item photo is required.",
            );
          }
          // The SDK checks the schema first; this is the handler's own
          // guard, for a caller that reaches it without that check.
          const currency = Currency.safeParse(args.currency);
          if (!currency.success) {
            throw new ToolError("Currency must be ZAR, USD or EUR.");
          }
          return await submitReimbursement({
            submitterId: scope.campUserId,
            team: args.team ?? null,
            amount: args.amount,
            currency: currency.data,
            accountType: args.accountType,
            accountDetailsEncrypted: encrypt(args.accountDetails),
            description: args.description,
            receiptBlobUrl: args.receiptBlobUrl,
            itemPhotoBlobUrl: args.itemPhotoBlobUrl,
            voiceMemoBlobUrl: args.voiceMemoBlobUrl,
          });
        },
      }),
  );

  server.registerTool(
    "list_my_reimbursements",
    {
      title: "List my submitted reimbursements",
      description:
        "Returns the current user's own submitted reimbursements, account details decrypted.",
      inputSchema: { status: StatusEnum.optional() },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_my_reimbursements",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const conditions = [
            eq(schema.reimbursements.submitterId, scope.campUserId),
          ];
          if (args.status)
            conditions.push(eq(schema.reimbursements.status, args.status));
          const rows = await db
            .select()
            .from(schema.reimbursements)
            .where(and(...conditions))
            .orderBy(desc(schema.reimbursements.createdAt));
          return truncateList(
            rows.map((r) => {
              const account = decryptField(r.accountDetailsEncrypted);
              return {
                ...r,
                accountDetails: account.value,
                // Bank details are on file but undecryptable here — never
                // report this to the user as "no account details saved".
                accountDetailsUnreadable: account.state === "unreadable",
              };
            }),
          );
        },
      }),
  );

  registerReviewTools(server);
}

// --- Review (captain and team lead) -----------------------------------------
// A captain reviews every claim. A team lead reviews the claims lodged under a
// team they lead this year; a claim under no team is a captain's. Paying and
// reconciling are a captain's. Nobody moves their own claim. Account details
// of someone else's claim are shown only to a captain, and only when the
// submitter's AI data consent is on (the consent gate in the proposal).

type Move = {
  from: ReimbursementStatus;
  to: ReimbursementStatus;
  title: string;
};

const MOVES = {
  approve_reimbursement: {
    from: "submitted",
    to: "approved",
    title: "Approve a reimbursement",
  },
  reject_reimbursement: {
    from: "submitted",
    to: "rejected",
    title: "Reject a reimbursement",
  },
  mark_reimbursement_paid: {
    from: "approved",
    to: "paid",
    title: "Mark a reimbursement paid",
  },
  mark_reimbursement_reconciled: {
    from: "paid",
    to: "reconciled",
    title: "Mark a reimbursement reconciled",
  },
} as const satisfies Record<string, Move>;

function canReview(
  scope: McpScope,
  claim: Pick<ReimbursementReviewRow, "team">,
): boolean {
  if (scope.isCaptain) return true;
  return claim.team !== null && scope.leadTeams.includes(claim.team);
}

/** The claim with its account details only where the caller may see them. */
function presentForReview(scope: McpScope, row: ReimbursementReviewRow) {
  const { accountDetailsEncrypted, submitterAiDataConsent, ...rest } = row;
  const own = row.submitterId === scope.campUserId;
  const mayRead = own || (scope.isCaptain && submitterAiDataConsent);
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

function registerReviewTools(server: McpServer): void {
  server.registerTool(
    "list_reimbursements",
    {
      title: "List reimbursements to review",
      description:
        "A captain gets every claim; a team lead gets the claims of teams they lead this year. Filter by status, or by team (\"general\" for claims under no team). Someone else's account details come back only for a captain, and only when that member's AI data consent is on.",
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
          if (!scope.isCaptain && scope.leadTeams.length === 0) {
            deny("Only a captain or a team lead can review reimbursements.");
          }
          let teams: ReimbursementTeam[] | undefined;
          if (!scope.isCaptain) {
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

  for (const [toolName, move] of Object.entries(MOVES) as [
    keyof typeof MOVES,
    Move,
  ][]) {
    const captainOnly = move.from !== "submitted";
    server.registerTool(
      toolName,
      {
        title: move.title,
        description: captainOnly
          ? `Captain only. Moves a claim from ${move.from} to ${move.to}. Nobody moves their own claim.`
          : `A captain, or the lead of the claim's team, moves a submitted claim to ${move.to}. Nobody decides their own claim.`,
        inputSchema: { id: z.string().uuid() },
      },
      async (args, extra) =>
        runTool({
          toolName,
          extra,
          argsForAudit: args,
          handler: async ({ scope }) => {
            const claim = await getReimbursementForReview(args.id);
            if (!claim) notFound("No reimbursement with that id.");
            const allowed = captainOnly
              ? scope.isCaptain
              : canReview(scope, claim);
            if (!allowed) {
              deny(
                captainOnly
                  ? "Only a captain can do this."
                  : "Only a captain or the lead of this claim's team can decide it.",
              );
            }
            if (claim.submitterId === scope.campUserId) {
              deny("Someone else has to review your own claim.");
            }
            if (claim.status !== move.from) {
              throw new ToolError(
                `This claim is ${claim.status}, so it can't be marked ${move.to}.`,
              );
            }
            const result = await moveReimbursement({
              id: args.id,
              from: move.from,
              to: move.to,
              actorId: scope.campUserId,
            });
            if (!result.ok) {
              throw new ToolError(
                "Someone else changed this claim just now. Read it again.",
              );
            }
            return { id: args.id, status: move.to };
          },
        }),
    );
  }
}
