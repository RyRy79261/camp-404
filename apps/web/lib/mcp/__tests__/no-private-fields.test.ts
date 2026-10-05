// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ALWAYS_PRIVATE } from "@camp404/core";
import { encrypt } from "@camp404/db/crypto";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeDriverProfile,
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";

// The owner's ruling on the connector (2026-10-05): "The agents won't need any
// access to that kind of information." No tool may return an ALWAYS_PRIVATE
// value (ID / passport numbers, bank and account details), for anyone, the
// person's own included.
//
// This walks EVERY registered tool, called both by a captain and by the member
// who owns the private data, against a camp (real Postgres, PGlite) where that
// data is on file: on the member row, in an old burner-profile answer and on a
// claim. Every answer, success or refusal, must carry none of the values (plain
// or encrypted) and no field named for one. A tool with no sample arguments
// below fails the test, so a new tool is walked too.

process.env.PGCRYPTO_KEY = "test-pgcrypto-key-at-least-16-chars";

vi.mock("next/server", () => ({ after: () => undefined }));

import { registerCampMcpTools } from "../server";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, { shape: z.ZodRawShape; handler: Handler }>();
registerCampMcpTools({
  registerTool: (
    name: string,
    config: { inputSchema?: z.ZodRawShape },
    handler: Handler,
  ) => {
    tools.set(name, { shape: config.inputSchema ?? {}, handler });
  },
} as unknown as McpServer);

/** Field names that would carry a private value once decrypted or renamed. */
const PRIVATE_KEYS = new Set([
  ...ALWAYS_PRIVATE,
  "passport",
  "saId",
  "eft",
  "idNumber",
  "accountDetails",
  "accountDetailsEncrypted",
]);

const SECRETS = {
  passport: "P7654321",
  saId: "9001015009087",
  eft: "FNB 6655443322",
  claimAccount: "ABSA 99887766",
  oldAnswer: "8501015009081",
};

/** Every key anywhere in a JSON value. */
function keysOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, out);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      out.push(key);
      keysOf(inner, out);
    }
  }
  return out;
}

// useTestDb is the PGlite harness (vitest hooks), not a React Hook.
// eslint-disable-next-line react-hooks/rules-of-hooks
const h = useTestDb();

describe("no tool returns ID numbers or bank details", () => {
  it("walks every tool, as a captain and as the data's own member", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
      passportEncrypted: encrypt(SECRETS.passport),
    });
    const member = await makeUser(db, {
      displayName: "Grace",
      approvalStatus: "approved",
      saIdEncrypted: encrypt(SECRETS.saId),
      eftDetailsEncrypted: encrypt(SECRETS.eft),
      inviteCode: "amber-fox-7",
    });
    await makeMembership(db, { userId: member.id, team: "kitchen" });
    await makeDriverProfile(db, { userId: captain.id });
    // An old answer row from before the number moved to the users column.
    await db.insert(schema.burnerProfiles).values({
      userId: member.id,
      version: "1",
      responses: { "id.type": "sa_id", "id.number": SECRETS.oldAnswer },
    });
    const [claim] = await db
      .insert(schema.reimbursements)
      .values({
        submitterId: member.id,
        team: "kitchen",
        amountCents: 450_00,
        currency: "ZAR",
        accountType: "sa",
        accountDetailsEncrypted: encrypt(SECRETS.claimAccount),
        description: "Gas",
      })
      .returning();
    const ciphertexts = (
      await db
        .select({
          a: schema.users.passportEncrypted,
          b: schema.users.saIdEncrypted,
          c: schema.users.eftDetailsEncrypted,
        })
        .from(schema.users)
    )
      .flatMap((r) => [r.a, r.b, r.c])
      .filter((v): v is string => Boolean(v));
    ciphertexts.push(claim!.accountDetailsEncrypted);

    const SAMPLE_ARGS: Record<string, Record<string, unknown>> = {
      whoami: {},
      what_can_i_do: {},
      list_my_required_actions: {},
      get_my_burner_profile: {},
      update_my_burner_profile: { responses: { "bio.statement": "hi" } },
      get_my_dietary_requirements: {},
      update_my_dietary_requirements: { foods: [], diets: [] },
      get_my_driver_profile: {},
      update_my_driver_profile: { version: "1", intendsToDrive: true },
      get_my_emergency_contacts: {},
      update_my_emergency_contacts: {
        contacts: [
          { name: "Ada", phone: "+27 82 555 0199", relationship: "sister" },
        ],
      },
      set_my_membership_tier: { tier: "full" },
      update_my_history: { skills: ["welding"] },
      list_users: {},
      get_user: { userId: member.id },
      get_team_budget: { team: "kitchen" },
      list_team_budgets: {},
      list_my_reimbursements: {},
      list_reimbursements: {},
      approve_reimbursement: { id: claim!.id },
      reject_reimbursement: { id: claim!.id },
      list_documents: {},
      get_document: { slug: "rules" },
      list_document_drafts: {},
      get_document_draft: { slug: "rules" },
      create_document: { title: "Rules", category: "on_site" },
      update_document: { slug: "rules", expectedVersion: 1, markdown: "x" },
      publish_document: { slug: "rules", published: false },
      list_questionnaire_drafts: {},
      get_questionnaire_draft: { key: "none" },
      create_questionnaire_draft: { title: "Theme ideas" },
      update_questionnaire_draft: {
        key: "none",
        definition: {
          version: "1",
          title: "x",
          pages: [
            {
              id: "p1",
              kind: "questions",
              title: "Gear",
              questions: [
                {
                  id: "q1",
                  kind: "short_text",
                  prompt: "What tent do you bring?",
                  maxLength: 120,
                  required: true,
                },
              ],
            },
          ],
        },
      },
      submit_recipe: { text: "Oats\nSoak overnight." },
      list_recipes: {},
      list_drivers: {},
      list_car_riders: { driverUserId: captain.id },
      get_my_lift: {},
      add_car_rider: { memberUserId: member.id },
      remove_car_rider: { memberUserId: member.id },
      list_invite_codes: {},
      revoke_invite_code: { code: "amber-fox-7" },
      list_audit_log: {},
      assign_team_membership: { userId: member.id, team: "structures" },
      remove_team_membership: { userId: member.id, team: "structures" },
      set_team_lead: { userId: member.id, team: "kitchen", isLead: false },
    };
    expect(Object.keys(SAMPLE_ARGS).sort()).toEqual([...tools.keys()].sort());

    let answers = 0;
    for (const [name, { shape, handler }] of tools) {
      const args = z.object(shape).parse(SAMPLE_ARGS[name]);
      for (const as of [captain.id, member.id]) {
        const result = await handler(args, {
          authInfo: { clientId: "test", extra: { campUserId: as } },
        });
        const text = (result.content[0] as { text: string }).text;
        const where = `${name} as ${as === captain.id ? "captain" : "member"}`;
        for (const secret of [...Object.values(SECRETS), ...ciphertexts]) {
          expect(text, where).not.toContain(secret);
        }
        if (!result.isError) {
          const found = keysOf(JSON.parse(text)).filter((k) =>
            PRIVATE_KEYS.has(k),
          );
          expect(found, where).toEqual([]);
          answers += 1;
        }
      }
    }
    // The walk read real answers, not only refusals.
    expect(answers).toBeGreaterThan(40);
  });
});
