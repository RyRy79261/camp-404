// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";

// The questionnaire builder's other saves against real Postgres (PGlite),
// through the real handlers: duplicating, a template, "Anonymous results" and
// the year policy, each on the builder action's own rule, with the audit rows
// the builder writes.

vi.mock("next/server", () => ({ after: () => undefined }));

import { registerCampMcpTools } from "../server";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, { shape: z.ZodRawShape; handler: Handler }>();
registerCampMcpTools({
  registerTool: (
    name: string,
    config: { inputSchema?: z.ZodObject },
    handler: Handler,
  ) => {
    tools.set(name, { shape: config.inputSchema?.shape ?? {}, handler });
  },
} as unknown as McpServer);

async function call(name: string, args: Record<string, unknown>, as: string) {
  const tool = tools.get(name)!;
  const result = await tool.handler(z.object(tool.shape).parse(args), {
    http: { authInfo: { clientId: "test", extra: { campUserId: as } } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError
    ? { error: text }
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each tool's own answer shape
      { data: JSON.parse(text) as any };
}

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

const approved = (overrides: Partial<typeof schema.users.$inferInsert> = {}) =>
  makeUser(h.db(), { approvalStatus: "approved", ...overrides });

async function camp() {
  const captain = await approved({ rank: "captain" });
  const lead = await approved();
  const otherLead = await approved();
  const member = await approved();
  await makeMembership(h.db(), {
    userId: lead.id,
    team: "kitchen",
    isLead: true,
  });
  await makeMembership(h.db(), {
    userId: otherLead.id,
    team: "structures",
    isLead: true,
  });
  return { captain, lead, otherLead, member };
}

async function definition(key: string) {
  const [row] = await h
    .db()
    .select()
    .from(schema.questionnaireDefinitions)
    .where(eq(schema.questionnaireDefinitions.key, key));
  return row;
}

async function audit(action: string) {
  return h
    .db()
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

describe("duplicate_questionnaire", () => {
  it("copies a questionnaire into a draft of the caller's own, and refuses a member", async () => {
    const { lead, otherLead, member } = await camp();
    const made = await call(
      "create_questionnaire_draft",
      { title: "Theme ideas" },
      lead.id,
    );
    const key = made.data.key as string;

    const refused = await call("duplicate_questionnaire", { key }, member.id);
    expect(refused.error).toMatch(/^Only a team lead or a captain can do this/);

    // Every member sees every questionnaire, so another lead may copy it.
    const copied = await call("duplicate_questionnaire", { key }, otherLead.id);
    expect(copied.error).toBeUndefined();
    const copy = await definition(copied.data.key);
    expect(copy).toMatchObject({
      title: "Theme ideas (copy)",
      status: "draft",
      createdBy: otherLead.id,
    });
    expect(
      await call("duplicate_questionnaire", { key: "no-such" }, lead.id),
    ).toEqual({ error: "Questionnaire not found." });
  });
});

describe("create_questionnaire_from_template", () => {
  it("starts the post-burn survey as the caller's draft, asked again each year", async () => {
    const { lead } = await camp();
    const made = await call(
      "create_questionnaire_from_template",
      { template: "post_burn_survey" },
      lead.id,
    );
    expect(made.error).toBeUndefined();
    expect(await definition(made.data.key)).toMatchObject({
      status: "draft",
      createdBy: lead.id,
      carryOver: false,
    });
  });
});

describe("set_questionnaire_anonymous_results", () => {
  it("lets the author hide names, refuses another lead, and never shows names after an answer", async () => {
    const { captain, lead, otherLead, member } = await camp();
    const key = (
      await call("create_questionnaire_draft", { title: "Vibes" }, lead.id)
    ).data.key as string;

    expect(
      await call(
        "set_questionnaire_anonymous_results",
        { key, anonymous: true },
        otherLead.id,
      ),
    ).toEqual({ error: "You can only edit your own questionnaires." });

    expect(
      (
        await call(
          "set_questionnaire_anonymous_results",
          { key, anonymous: true },
          lead.id,
        )
      ).data,
    ).toMatchObject({ key, anonymousResults: true });
    expect((await definition(key))!.anonymousResults).toBe(true);
    expect(await audit("questionnaire.anonymous_results_set")).toEqual([
      expect.objectContaining({ actorId: lead.id, target: key }),
    ]);
    expect(
      (await call("get_questionnaire_settings", { key }, lead.id)).data,
    ).toMatchObject({ anonymousResults: true, canEdit: true });

    // Someone answered on the word "no names": names stay hidden.
    await h.db().insert(schema.questionnaireResponses).values({
      userId: member.id,
      definitionKey: key,
      definitionVersion: "1",
    });
    expect(
      await call(
        "set_questionnaire_anonymous_results",
        { key, anonymous: false },
        captain.id,
      ),
    ).toEqual({
      error:
        "People already answered this with no names, so names stay hidden.",
    });
    expect((await definition(key))!.anonymousResults).toBe(true);
  });
});

describe("set_questionnaire_carry_over", () => {
  it("is a captain's, audited, and read back by a captain only", async () => {
    const { captain, lead } = await camp();
    const key = (
      await call("create_questionnaire_draft", { title: "Gear" }, lead.id)
    ).data.key as string;

    const refused = await call(
      "set_questionnaire_carry_over",
      { key, carryOver: false },
      lead.id,
    );
    expect(refused.error).toMatch(/^Only a captain can do this\./);
    expect((await definition(key))!.carryOver).toBe(true);

    expect(
      (
        await call(
          "set_questionnaire_carry_over",
          { key, carryOver: false },
          captain.id,
        )
      ).data,
    ).toMatchObject({ key, carryOver: false });
    expect((await definition(key))!.carryOver).toBe(false);
    expect(await audit("questionnaire.carry_over_set")).toEqual([
      expect.objectContaining({ actorId: captain.id, target: key }),
    ]);
    expect(
      (await call("get_questionnaire_settings", { key }, captain.id)).data,
    ).toMatchObject({ carryOver: false });
    expect(
      (await call("get_questionnaire_settings", { key }, lead.id)).data
        .carryOver,
    ).toBeUndefined();
  });
});
