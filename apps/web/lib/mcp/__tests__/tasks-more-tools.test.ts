// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  CANNOT_EDIT_TASK,
  NOT_YOUR_TEAM_TO_MOVE_TASK,
  campDayKey,
} from "@camp404/core";
import { TASK_EDITED } from "@camp404/types";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";

// edit_task and get_task against real Postgres (PGlite), through the real
// handlers: the Tasks page's Edit for the same person, its rule (whoever
// added it, a lead of its team, a captain) and its compare-and-set on the
// version read. The page writes no audit row for the board, and neither does
// this.

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
  const cook = await approved();
  const loner = await approved();
  await makeMembership(h.db(), {
    userId: lead.id,
    team: "kitchen",
    isLead: true,
  });
  await makeMembership(h.db(), { userId: cook.id, team: "kitchen" });
  return { captain, lead, cook, loner };
}

async function task(input: Partial<typeof schema.tasks.$inferInsert> = {}) {
  const [row] = await h
    .db()
    .insert(schema.tasks)
    .values({
      title: "Buy gas",
      description: "Two bottles",
      team: "kitchen",
      dueAt: new Date("2099-04-19T22:00:00Z"),
      ...input,
    })
    .returning();
  return row!;
}

async function row(id: string) {
  const [r] = await h
    .db()
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, id));
  return r!;
}

describe("get_task", () => {
  it("reads a task with its version and whether the caller may edit it", async () => {
    const { lead, cook } = await camp();
    const t = await task({ assigneeId: cook.id });
    const asLead = (await call("get_task", { taskId: t.id }, lead.id)).data;
    expect(asLead).toMatchObject({
      id: t.id,
      title: "Buy gas",
      description: "Two bottles",
      team: "kitchen",
      assigneeId: cook.id,
      due: "2099-04-20",
      version: 1,
      canEdit: true,
    });
    // The person responsible may move it, but not edit it.
    expect(
      (await call("get_task", { taskId: t.id }, cook.id)).data,
    ).toMatchObject({ canEdit: false, canMove: true });
    expect(
      await call(
        "get_task",
        { taskId: "11111111-1111-4111-8111-111111111111" },
        cook.id,
      ),
    ).toEqual({ error: "That task isn't on the board." });
  });
});

describe("edit_task", () => {
  it("changes only what is given, on the version read, for a lead of its team", async () => {
    const { lead, cook } = await camp();
    const t = await task();
    const saved = await call(
      "edit_task",
      {
        taskId: t.id,
        expectedVersion: 1,
        title: "Buy gas and matches",
        assigneeId: cook.id,
      },
      lead.id,
    );
    expect(saved.error).toBeUndefined();
    expect(saved.data).toMatchObject({ id: t.id, version: 2 });
    const after = await row(t.id);
    expect(after).toMatchObject({
      title: "Buy gas and matches",
      description: "Two bottles",
      team: "kitchen",
      assigneeId: cook.id,
      version: 2,
    });
    // The deadline stays on its camp day.
    expect(campDayKey(after.dueAt!)).toBe("2099-04-20");

    // null clears the details and the deadline.
    const cleared = await call(
      "edit_task",
      { taskId: t.id, expectedVersion: 2, description: null, due: null },
      lead.id,
    );
    expect(cleared.error).toBeUndefined();
    expect(await row(t.id)).toMatchObject({
      description: null,
      dueAt: null,
      title: "Buy gas and matches",
      version: 3,
    });
  });

  it("refuses someone who may not edit it, and a team the lead does not lead, in the board's words", async () => {
    const { lead, cook, loner } = await camp();
    const t = await task({ assigneeId: cook.id });
    // The person responsible may not edit it (only move it).
    expect(
      await call(
        "edit_task",
        { taskId: t.id, expectedVersion: 1, title: "Mine now" },
        cook.id,
      ),
    ).toEqual({ error: CANNOT_EDIT_TASK });
    expect(
      await call(
        "edit_task",
        { taskId: t.id, expectedVersion: 1, title: "Mine now" },
        loner.id,
      ),
    ).toEqual({ error: CANNOT_EDIT_TASK });
    expect(
      await call(
        "edit_task",
        { taskId: t.id, expectedVersion: 1, team: "structures" },
        lead.id,
      ),
    ).toEqual({ error: NOT_YOUR_TEAM_TO_MOVE_TASK });
    expect(await row(t.id)).toMatchObject({
      title: "Buy gas",
      team: "kitchen",
      version: 1,
    });
  });

  it("lets whoever added it and a captain edit it, and refuses a version someone moved past", async () => {
    const { captain, loner } = await camp();
    const t = await task({ createdByUserId: loner.id, team: null });
    expect(
      (
        await call(
          "edit_task",
          { taskId: t.id, expectedVersion: 1, title: "Buy gas today" },
          loner.id,
        )
      ).data,
    ).toMatchObject({ version: 2 });
    // The captain read version 1: the edit in between wins, nothing changes.
    expect(
      await call(
        "edit_task",
        { taskId: t.id, expectedVersion: 1, title: "Overwrite" },
        captain.id,
      ),
    ).toEqual({ error: TASK_EDITED });
    expect((await row(t.id)).title).toBe("Buy gas today");
    expect(
      (
        await call(
          "edit_task",
          { taskId: t.id, expectedVersion: 2, team: "kitchen" },
          captain.id,
        )
      ).data,
    ).toMatchObject({ version: 3 });
    expect((await row(t.id)).team).toBe("kitchen");
  });
});
