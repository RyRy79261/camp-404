// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { NOT_A_CHAPTER_WRITER } from "@camp404/core";
import { CHAPTER_NOT_PUBLISHED } from "@camp404/db/documents";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";

// mark_document_reviewed against real Postgres (PGlite), through the real
// handler: the guide editor's "Still right for this year", on the writer rule
// (a captain any chapter, a lead their teams'), published chapters only, with
// the page's audit row.

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
  const builder = await approved();
  const member = await approved();
  await makeMembership(h.db(), {
    userId: lead.id,
    team: "kitchen",
    isLead: true,
  });
  await makeMembership(h.db(), {
    userId: builder.id,
    team: "structures",
    isLead: true,
  });
  return { captain, lead, builder, member };
}

async function chapter(as: string) {
  const made = await call(
    "create_document",
    {
      title: "Kitchen rules",
      category: "on_site",
      team: "kitchen",
      markdown: "Wash your hands.",
    },
    as,
  );
  expect(made.error).toBeUndefined();
  return made.data.slug as string;
}

async function doc(slug: string) {
  const [row] = await h
    .db()
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.slug, slug));
  return row!;
}

describe("mark_document_reviewed", () => {
  it("marks a published chapter for this year, for a lead of its team, audited", async () => {
    const { lead } = await camp();
    const slug = await chapter(lead.id);

    expect(await call("mark_document_reviewed", { slug }, lead.id)).toEqual({
      error: CHAPTER_NOT_PUBLISHED,
    });

    const { version } = await doc(slug);
    expect(
      (
        await call(
          "publish_document",
          { slug, published: true, expectedVersion: version },
          lead.id,
        )
      ).error,
    ).toBeUndefined();
    const before = await doc(slug);

    const marked = await call("mark_document_reviewed", { slug }, lead.id);
    expect(marked.error).toBeUndefined();
    expect(marked.data).toMatchObject({ slug, reviewedForYear: 1 });
    const after = await doc(slug);
    expect(after.cycleReviewed).toBe(1);
    // Nothing a reader sees changes.
    expect(after.markdown).toBe(before.markdown);
    expect(after.version).toBe(before.version);
    const log = await h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "document.reviewed"));
    expect(log).toEqual([
      expect.objectContaining({ actorId: lead.id, target: slug }),
    ]);
  });

  it("refuses a lead of another team in the guide's words, and a member at the gate", async () => {
    const { captain, builder, member } = await camp();
    const slug = await chapter(captain.id);
    const { version } = await doc(slug);
    await call(
      "publish_document",
      { slug, published: true, expectedVersion: version },
      captain.id,
    );
    expect(await call("mark_document_reviewed", { slug }, builder.id)).toEqual({
      error: NOT_A_CHAPTER_WRITER,
    });
    expect(
      (await call("mark_document_reviewed", { slug }, member.id)).error,
    ).toMatch(/^Only a team lead or a captain can do this.+\/guide$/);
    const reviewed = () =>
      h
        .db()
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "document.reviewed"));
    expect(await reviewed()).toEqual([]);
    expect(
      (await call("mark_document_reviewed", { slug }, captain.id)).data,
    ).toMatchObject({ reviewedForYear: 1 });
    expect(await reviewed()).toEqual([
      expect.objectContaining({ actorId: captain.id }),
    ]);
  });
});
