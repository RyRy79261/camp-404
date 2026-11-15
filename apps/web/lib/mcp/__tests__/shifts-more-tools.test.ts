// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  NOT_A_SHIFT_KEEPER,
  SHIFT_CLOSED,
  SHIFT_FULL,
  SHIFT_MEMBER_NOT_ON,
  SHIFT_SLOT_CHANGED,
  VOLUNTEER_SHIFT_GONE,
} from "@camp404/db/shifts";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";
import { SHIFTS_ACTION_REFUSAL } from "../../shifts-copy";

// The Shifts pages' other writes against real Postgres (PGlite), through the
// real handlers: who may (a lead of the shift's team, a captain; a member for
// their own AfrikaBurn shifts), the page's refusals, the audit rows the page
// writes, and the compare-and-set on a slot's version.

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
  const captain = await approved({ rank: "captain", displayName: "Cap Tain" });
  const lead = await approved({ displayName: "Lee Lead" });
  const cook = await approved({ displayName: "Cee Cook" });
  const builder = await approved({ displayName: "Bo Builder" });
  await makeMembership(h.db(), {
    userId: lead.id,
    team: "kitchen",
    isLead: true,
  });
  await makeMembership(h.db(), { userId: cook.id, team: "kitchen" });
  await makeMembership(h.db(), {
    userId: builder.id,
    team: "structures",
    isLead: true,
  });
  return { captain, lead, cook, builder };
}

async function shiftType(places = 1) {
  const [type] = await h
    .db()
    .insert(schema.shiftTypes)
    .values({
      cycle: 1,
      team: "kitchen",
      name: "Dishes",
      startMinute: 18 * 60,
      durationMinutes: 60,
      places,
    })
    .returning();
  return type!;
}

async function slot(day: string, places = 1) {
  const type = await shiftType(places);
  const [row] = await h
    .db()
    .insert(schema.shiftSlots)
    .values({ typeId: type.id, day })
    .returning();
  return row!.id;
}

async function audit(action: string) {
  return h
    .db()
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

describe("placing people", () => {
  it("lets a lead of the shift's team put a member on and take them off, audited", async () => {
    const { lead, cook, builder } = await camp();
    const slotId = await slot("2099-04-29", 1);

    // A lead of another team: past the door, refused by the write.
    expect(
      await call(
        "place_member_on_shift",
        { slotId, userId: cook.id },
        builder.id,
      ),
    ).toEqual({ error: NOT_A_SHIFT_KEEPER });
    // A plain member: refused at the door, with the page.
    const asMember = await call(
      "place_member_on_shift",
      { slotId, userId: cook.id },
      cook.id,
    );
    expect(asMember.error).toMatch(
      new RegExp(
        `^${SHIFTS_ACTION_REFUSAL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} On the website: \\S+/shifts$`,
      ),
    );

    const placed = await call(
      "place_member_on_shift",
      { slotId, userId: cook.id },
      lead.id,
    );
    expect(placed.error).toBeUndefined();
    expect(placed.data).toMatchObject({ slotId, taken: 1, who: ["Cee C."] });
    expect(placed.data.people).toEqual([
      { userId: cook.id, name: "Cee C.", you: false },
    ]);
    const [signup] = await h
      .db()
      .select()
      .from(schema.shiftSignups)
      .where(eq(schema.shiftSignups.slotId, slotId));
    expect(signup).toMatchObject({ userId: cook.id, addedByUserId: lead.id });
    expect(await audit("shifts.member_placed")).toEqual([
      expect.objectContaining({ actorId: lead.id, target: cook.id }),
    ]);

    // One place, taken.
    expect(
      await call("place_member_on_shift", { slotId, userId: lead.id }, lead.id),
    ).toEqual({ error: SHIFT_FULL });

    expect(
      (
        await call(
          "take_member_off_shift",
          { slotId, userId: cook.id },
          lead.id,
        )
      ).data,
    ).toMatchObject({ taken: 0 });
    expect(await audit("shifts.member_removed")).toHaveLength(1);
    expect(
      await call("take_member_off_shift", { slotId, userId: cook.id }, lead.id),
    ).toEqual({ error: SHIFT_MEMBER_NOT_ON });
  });

  it("refuses a day that has started", async () => {
    const { captain, cook } = await camp();
    const slotId = await slot("2020-04-29");
    expect(
      await call(
        "place_member_on_shift",
        { slotId, userId: cook.id },
        captain.id,
      ),
    ).toEqual({ error: SHIFT_CLOSED });
  });
});

describe("set_shift_slot_needed", () => {
  it("marks a day not needed on the version read, audited, and refuses a stale version", async () => {
    const { captain, lead, cook } = await camp();
    const slotId = await slot("2099-04-29", 2);
    const read = (await call("get_shift_slot", { slotId }, lead.id)).data;
    expect(read).toMatchObject({
      version: 1,
      needed: true,
      youMayChange: true,
    });
    // A member reads it too, without anyone's ids.
    expect(
      (await call("get_shift_slot", { slotId }, cook.id)).data,
    ).toMatchObject({ people: null, youMayChange: false });

    const off = await call(
      "set_shift_slot_needed",
      { slotId, needed: false, expectedVersion: 1 },
      lead.id,
    );
    expect(off.error).toBeUndefined();
    expect(off.data).toMatchObject({ needed: false, version: 2 });
    expect(await audit("shifts.slot_needed_set")).toEqual([
      expect.objectContaining({ actorId: lead.id }),
    ]);

    // The captain read version 1: refused, it stays not needed.
    expect(
      await call(
        "set_shift_slot_needed",
        { slotId, needed: true, expectedVersion: 1 },
        captain.id,
      ),
    ).toEqual({ error: SHIFT_SLOT_CHANGED });
    const [row] = await h
      .db()
      .select({ status: schema.shiftSlots.status })
      .from(schema.shiftSlots)
      .where(eq(schema.shiftSlots.id, slotId));
    expect(row!.status).toBe("not_needed");
  });
});

describe("fill_shift_days", () => {
  it("adds a slot on each Burn day to come, once, for a lead of its team", async () => {
    const { lead, builder } = await camp();
    await h.db().insert(schema.logisticsPhases).values({
      cycle: 1,
      phase: "burn",
      startDate: "2099-04-27",
      endDate: "2099-04-29",
    });
    const type = await shiftType();
    expect(
      await call("fill_shift_days", { typeId: type.id }, builder.id),
    ).toEqual({ error: NOT_A_SHIFT_KEEPER });
    expect(
      (await call("fill_shift_days", { typeId: type.id }, lead.id)).data,
    ).toMatchObject({ daysAdded: 3 });
    expect(
      (await call("fill_shift_days", { typeId: type.id }, lead.id)).data,
    ).toMatchObject({ daysAdded: 0 });
    expect(
      await h
        .db()
        .select()
        .from(schema.shiftSlots)
        .where(eq(schema.shiftSlots.typeId, type.id)),
    ).toHaveLength(3);
    expect(await audit("shifts.days_added")).toHaveLength(1);
  });
});

describe("volunteer shifts", () => {
  it("notes, lists and takes off the caller's own AfrikaBurn shifts only", async () => {
    const { cook, lead } = await camp();
    const bad = await call(
      "add_volunteer_shift",
      {
        department: "Rangers",
        day: "2099-04-28",
        startMinute: 600,
        durationMinutes: 50,
      },
      cook.id,
    );
    expect(bad.error).toBe("Use whole quarter hours.");

    const added = await call(
      "add_volunteer_shift",
      {
        department: "Rangers",
        day: "2099-04-28",
        startMinute: 600,
        durationMinutes: 240,
      },
      cook.id,
    );
    expect(added.error).toBeUndefined();
    const id = added.data.id as string;
    expect(
      (await call("list_my_volunteer_shifts", {}, cook.id)).data.volunteer,
    ).toEqual([
      expect.objectContaining({ id, department: "Rangers", day: "2099-04-28" }),
    ]);
    expect(
      (await call("list_my_volunteer_shifts", {}, lead.id)).data.volunteer,
    ).toEqual([]);

    // Someone else's id: nothing happens.
    expect(await call("remove_volunteer_shift", { id }, lead.id)).toEqual({
      error: VOLUNTEER_SHIFT_GONE,
    });
    expect(
      (await call("remove_volunteer_shift", { id }, cook.id)).data,
    ).toMatchObject({ id, removed: true });
    expect(
      await h
        .db()
        .select()
        .from(schema.volunteerShifts)
        .where(
          and(
            eq(schema.volunteerShifts.userId, cook.id),
            eq(schema.volunteerShifts.cycle, 1),
          ),
        ),
    ).toEqual([]);
  });
});
