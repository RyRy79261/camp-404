// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ALREADY_TOWING,
  CANNOT_TOW,
  NOT_YOUR_CAR,
  SEATS_BELOW_RIDERS,
  TRANSPORT_TEAM,
} from "@camp404/core";
import { TRAILER_CHANGED } from "@camp404/db/transport";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeCarMember,
  makeDriverProfile,
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";

// The Transport page's seats, lift requests and trailers against real
// Postgres (PGlite), through the real handlers: who may (the car's driver; a
// captain or a Transport & Logistics lead), the page's refusals, the seats'
// audit row, and the trailers' compare-and-set on the version read.

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

/** A captain, a Transport lead, two drivers (one tows) and a rider. */
async function camp() {
  const db = h.db();
  const captain = await approved({ rank: "captain" });
  const lead = await approved({ displayName: "Tee Lead" });
  const driver = await approved({ displayName: "Dee Driver" });
  const tower = await approved({ displayName: "Toby Tow" });
  const rider = await approved({ displayName: "Ri Der" });
  await makeMembership(db, {
    userId: lead.id,
    team: TRANSPORT_TEAM,
    isLead: true,
  });
  await makeDriverProfile(db, { userId: driver.id });
  await makeDriverProfile(db, { userId: tower.id });
  await db
    .update(schema.driverProfiles)
    .set({ seatsOffered: 3 })
    .where(eq(schema.driverProfiles.userId, driver.id));
  await db
    .update(schema.driverProfiles)
    .set({ canTow: true, seatsOffered: 2 })
    .where(eq(schema.driverProfiles.userId, tower.id));
  return { captain, lead, driver, tower, rider };
}

async function seats(driverUserId: string) {
  const [row] = await h
    .db()
    .select({ seats: schema.driverProfiles.seatsOffered })
    .from(schema.driverProfiles)
    .where(
      and(
        eq(schema.driverProfiles.userId, driverUserId),
        eq(schema.driverProfiles.cycle, 1),
      ),
    );
  return row!.seats;
}

describe("set_car_seats", () => {
  it("sets the driver's own car, refuses another's car and fewer seats than riders", async () => {
    const { driver, tower, rider } = await camp();
    await makeCarMember(h.db(), {
      driverUserId: driver.id,
      memberUserId: rider.id,
    });

    const own = await call("set_car_seats", { seatsOffered: 4 }, driver.id);
    expect(own.error).toBeUndefined();
    expect(own.data).toMatchObject({ seatsOffered: 4, seatsTaken: 1 });
    expect(await seats(driver.id)).toBe(4);
    const [log] = await h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "car.seats_set"));
    expect(log).toMatchObject({ actorId: driver.id, target: driver.id });

    expect(
      await call(
        "set_car_seats",
        { seatsOffered: 1, driverUserId: driver.id },
        tower.id,
      ),
    ).toEqual({ error: NOT_YOUR_CAR });
    expect(await call("set_car_seats", { seatsOffered: 0 }, driver.id)).toEqual(
      { error: SEATS_BELOW_RIDERS },
    );
    expect(await seats(driver.id)).toBe(4);
  });

  it("lets a Transport & Logistics lead set any car's seats", async () => {
    const { lead, tower } = await camp();
    expect(
      (
        await call(
          "set_car_seats",
          { seatsOffered: 5, driverUserId: tower.id },
          lead.id,
        )
      ).data,
    ).toMatchObject({ driverUserId: tower.id, seatsOffered: 5 });
    expect(await seats(tower.id)).toBe(5);
  });
});

describe("list_lift_requests", () => {
  it("shows an editor every request and who needs a seat, a driver theirs, a member their own", async () => {
    const { lead, driver, rider } = await camp();
    const other = await approved({ displayName: "Oh Ther" });
    await h
      .db()
      .insert(schema.liftRequests)
      .values([
        { userId: rider.id, cycle: 1, driverUserId: driver.id },
        { userId: other.id, cycle: 1, driverUserId: null },
      ]);
    const asLead = (await call("list_lift_requests", {}, lead.id)).data;
    expect(asLead.requests.map((r: { name: string }) => r.name).sort()).toEqual(
      ["Oh Ther", "Ri Der"],
    );
    expect(asLead.needSeat).toEqual(expect.any(Array));

    const asDriver = (await call("list_lift_requests", {}, driver.id)).data;
    expect(asDriver.requests).toEqual([
      expect.objectContaining({
        userId: rider.id,
        car: { driverUserId: driver.id, driverName: "Dee Driver" },
      }),
    ]);
    expect(asDriver.needSeat).toBeUndefined();

    const asOther = (await call("list_lift_requests", {}, other.id)).data;
    expect(asOther.requests).toEqual([
      expect.objectContaining({ userId: other.id, anyCar: true, mine: true }),
    ]);

    // Matching an any-car request is add_car_rider: it spends the request.
    expect(
      (
        await call(
          "add_car_rider",
          { memberUserId: other.id, driverUserId: driver.id },
          lead.id,
        )
      ).error,
    ).toBeUndefined();
    expect(
      (await call("list_lift_requests", {}, lead.id)).data.requests,
    ).toHaveLength(1);
  });
});

describe("trailers", () => {
  it("adds, changes and tows a trailer for a Transport & Logistics lead, on the version read", async () => {
    const { lead, captain, tower } = await camp();
    const added = await call(
      "add_trailer",
      { name: "Big box", notes: "Blue tarp" },
      lead.id,
    );
    expect(added.error).toBeUndefined();
    const trailerId = added.data.id as string;
    expect(added.data).toMatchObject({ name: "Big box", version: 0 });

    const renamed = await call(
      "update_trailer",
      { trailerId, expectedVersion: 0, name: "Big blue box" },
      lead.id,
    );
    expect(renamed.data).toMatchObject({
      name: "Big blue box",
      notes: "Blue tarp",
      version: 1,
    });

    // A captain who read version 0: refused, nothing changes.
    expect(
      await call(
        "update_trailer",
        { trailerId, expectedVersion: 0, notes: null },
        captain.id,
      ),
    ).toEqual({ error: TRAILER_CHANGED });
    expect(
      await call(
        "set_trailer_tow",
        { trailerId, expectedVersion: 0, driverUserId: tower.id },
        captain.id,
      ),
    ).toEqual({ error: TRAILER_CHANGED });

    const towed = await call(
      "set_trailer_tow",
      { trailerId, expectedVersion: 1, driverUserId: tower.id },
      captain.id,
    );
    expect(towed.data).toMatchObject({
      towedByUserId: tower.id,
      towedByName: "Toby Tow",
      version: 2,
    });
    const [row] = await h
      .db()
      .select()
      .from(schema.transportTrailers)
      .where(eq(schema.transportTrailers.id, trailerId));
    expect(row).toMatchObject({
      name: "Big blue box",
      notes: "Blue tarp",
      towedByUserId: tower.id,
      version: 2,
    });
    expect((await call("list_trailers", {}, tower.id)).data.trailers).toEqual([
      expect.objectContaining({ id: trailerId, version: 2 }),
    ]);
  });

  it("refuses a member at the gate, a car that cannot tow and one already towing", async () => {
    const { lead, driver, tower, rider } = await camp();
    const asMember = await call("add_trailer", { name: "Box" }, rider.id);
    expect(asMember.error).toMatch(
      /^Only a captain or a Transport & Logistics lead can do this\. On the website: \S+\/transport$/,
    );

    const first = (await call("add_trailer", { name: "One" }, lead.id)).data;
    const second = (await call("add_trailer", { name: "Two" }, lead.id)).data;
    expect(
      await call(
        "set_trailer_tow",
        { trailerId: first.id, expectedVersion: 0, driverUserId: driver.id },
        lead.id,
      ),
    ).toEqual({ error: CANNOT_TOW });
    await call(
      "set_trailer_tow",
      { trailerId: first.id, expectedVersion: 0, driverUserId: tower.id },
      lead.id,
    );
    expect(
      await call(
        "set_trailer_tow",
        { trailerId: second.id, expectedVersion: 0, driverUserId: tower.id },
        lead.id,
      ),
    ).toEqual({ error: ALREADY_TOWING });
  });
});
