// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { Team } from "@camp404/types";
import type { CampConfig } from "@camp404/db/camp-config";
import {
  confirmRentalOrder,
  getRentalOrderOf,
  saveRentalOrder,
} from "@camp404/db/rental";
import { RENTAL_REFUSAL } from "../../rental-copy";
import { RENTAL_ITEM_CHANGED, TENT_LABEL_CHANGED } from "../tools/gear-rental";
import * as schema from "@camp404/db/schema";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";

vi.mock("next/server", () => ({ after: () => undefined }));

import { registerCampMcpTools } from "../server";

// The captains' gear rental catalogue and tent labels against real Postgres
// (PGlite), through the real handlers: only a captain, refused in the page's
// words otherwise, the rows and audit rows the page's write leaves, and the
// check on what the caller read (the item's fingerprint, the tent's label).

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerCampMcpTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer);

async function call(name: string, args: unknown, as: string) {
  const result = await tools.get(name)!(args, {
    http: { authInfo: { clientId: "test", extra: { campUserId: as } } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError
    ? { error: text }
    : { data: JSON.parse(text) as Record<string, unknown> };
}

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

async function campYear(year = 2026) {
  const cycles: CampConfig["cycles"] = [
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await h
    .db()
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await h
    .db()
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await h
    .db()
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

const member = () => makeUser(h.db(), { approvalStatus: "approved" });
const captain = () =>
  makeUser(h.db(), { approvalStatus: "approved", rank: "captain" });

async function leadOf(team: Team) {
  const user = await member();
  await assignTeam({ userId: user.id, team });
  await setLead({ userId: user.id, team, isLead: true });
  return user;
}

async function auditRows(action: string) {
  return h
    .db()
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const onThePage = (sentence: string, path: string) =>
  new RegExp(`^${escape(sentence)} On the website: https?://\\S+${path}$`);

const TENT = {
  name: "2-person tent",
  isTent: true,
  sleeps: 2,
  campPriceCents: 10_000,
  campStockCount: 2,
  supplierPriceCents: 25_000,
  reserveCount: 0,
  reserveSource: "supplier",
};

describe("the gear rental catalogue", () => {
  it("lets a captain add and change an item from what they read, with the page's audit rows", async () => {
    await campYear();
    const boss = await captain();
    const added = await call("add_rental_item", TENT, boss.id);
    expect(added.error).toBeUndefined();
    const itemId = added.data!.id as string;
    const read = await call("get_gear_rental_catalogue", {}, boss.id);
    const [item] = read.data!.items as { id: string; fingerprint: string }[];
    expect(item).toMatchObject({ id: itemId, campStockCount: 2 });
    expect(
      (
        await call(
          "update_rental_item",
          {
            itemId,
            fingerprint: item!.fingerprint,
            supplierPriceCents: 27_000,
          },
          boss.id,
        )
      ).error,
    ).toBeUndefined();
    const [row] = await h.db().select().from(schema.rentalItems);
    expect(row).toMatchObject({
      name: "2-person tent",
      campPriceCents: 10_000,
      campStockCount: 2,
      supplierPriceCents: 27_000,
    });
    // The fingerprint read before that change no longer matches.
    expect(
      (
        await call(
          "update_rental_item",
          { itemId, fingerprint: item!.fingerprint, sleeps: 3 },
          boss.id,
        )
      ).error,
    ).toBe(RENTAL_ITEM_CHANGED);
    expect(await auditRows("rental.item_added")).toHaveLength(1);
    expect(await auditRows("rental.item_changed")).toHaveLength(1);
  });

  it("refuses a team lead and a member in the page's words", async () => {
    await campYear();
    for (const who of [await member(), await leadOf("finance" as Team)]) {
      expect((await call("add_rental_item", TENT, who.id)).error).toMatch(
        onThePage(RENTAL_REFUSAL, "/captains/gear-rental/catalogue"),
      );
      expect(
        (await call("get_gear_rental_catalogue", {}, who.id)).error,
      ).toMatch(onThePage(RENTAL_REFUSAL, "/captains/gear-rental/catalogue"));
    }
    expect(await h.db().select().from(schema.rentalItems)).toEqual([]);
  });
});

describe("set_tent_label", () => {
  it("labels a camp tent on a confirmed order from the label read", async () => {
    await campYear();
    const boss = await captain();
    const owner = await member();
    const tentId = (await call("add_rental_item", TENT, boss.id)).data!
      .id as string;
    const saved = await saveRentalOrder({
      userId: owner.id,
      cycle: 2026,
      tent: { choice: "need", people: 1, sharerIds: [] },
      lines: [],
      submit: true,
      expectedVersion: 0,
    });
    expect(saved.ok).toBe(true);
    const order = (await getRentalOrderOf(owner.id, 2026))!;
    const confirmed = await confirmRentalOrder({
      orderId: order.id,
      expectedVersion: order.version,
      tent: { itemId: tentId, source: "camp" },
      sources: [],
      actorId: boss.id,
    });
    expect(confirmed.ok).toBe(true);
    const read = await call("get_gear_rental_catalogue", {}, boss.id);
    const [tent] = read.data!.tents as { lineId: string; label: null }[];
    expect(tent).toMatchObject({ label: null });
    const lineId = tent!.lineId;
    expect(
      (
        await call(
          "set_tent_label",
          { lineId, label: "T3", from: null },
          boss.id,
        )
      ).error,
    ).toBeUndefined();
    expect(
      (
        await call(
          "set_tent_label",
          { lineId, label: "T4", from: null },
          boss.id,
        )
      ).error,
    ).toBe(TENT_LABEL_CHANGED);
    const [line] = await h
      .db()
      .select()
      .from(schema.rentalOrderLines)
      .where(eq(schema.rentalOrderLines.id, lineId));
    expect(line!.tentLabel).toBe("T3");
    expect(await auditRows("rental.tent_labelled")).toHaveLength(1);
  });
});
