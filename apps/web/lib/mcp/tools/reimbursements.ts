import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { decryptOrNull, encrypt } from "@camp404/db/crypto";
import { runTool, truncateList } from "../tool-utils";

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
        currency: z.string().length(3),
        accountType: AccountTypeEnum,
        accountDetails: z
          .string()
          .min(1)
          .describe("Account number + bank / SWIFT or international equivalent."),
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
            throw new Error("At least one of receipt or item photo is required.");
          }
          const db = createHttpDb();
          const [row] = await db
            .insert(schema.reimbursements)
            .values({
              submitterId: scope.campUserId,
              team: args.team ?? null,
              amount: args.amount,
              currency: args.currency,
              accountType: args.accountType,
              accountDetailsEncrypted: encrypt(args.accountDetails),
              description: args.description,
              receiptBlobUrl: args.receiptBlobUrl ?? null,
              itemPhotoBlobUrl: args.itemPhotoBlobUrl ?? null,
              voiceMemoBlobUrl: args.voiceMemoBlobUrl ?? null,
            })
            .returning({
              id: schema.reimbursements.id,
              status: schema.reimbursements.status,
            });
          return row;
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
          const conditions = [eq(schema.reimbursements.submitterId, scope.campUserId)];
          if (args.status) conditions.push(eq(schema.reimbursements.status, args.status));
          const rows = await db
            .select()
            .from(schema.reimbursements)
            .where(and(...conditions))
            .orderBy(desc(schema.reimbursements.createdAt));
          return truncateList(
            rows.map((r) => ({ ...r, accountDetails: decryptOrNull(r.accountDetailsEncrypted) })),
          );
        },
      }),
  );

  // Admin (`list_reimbursements`, `approve`, `reject`, `mark_paid`,
  // `mark_reconciled`) ships in the captain batch — they're not member-tier.
}
