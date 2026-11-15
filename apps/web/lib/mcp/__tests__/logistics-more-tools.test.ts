// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { Team } from "@camp404/types";
import type { CampConfig } from "@camp404/db/camp-config";
import { PHASE_CHANGED } from "@camp404/db/logistics";
import { LOGISTICS_REFUSAL } from "../../logistics-copy";
import * as schema from "@camp404/db/schema";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";

vi.mock("next/server", () => ({ after: () => undefined }));

import { registerCampMcpTools } from "../server";

// The Logistics page's Clear against real Postgres (PGlite), through the real
// handler: who may, who is refused and in what words, the row and audit row
// the page's write leaves, and the compare-and-set on the version read.

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

const BUILD = {
  phase: "build",
  startDate: "2026-04-22",
  endDate: "2026-04-24",
  place: "Tankwa",
  note: "Bring shade cloth",
  expectedVersion: 0,
};

describe("clear_logistics_days", () => {
  it("clears a phase's days, place and note on the version read, with the page's audit row", async () => {
    await campYear();
    const tl = await leadOf("transport_and_logistics");
    expect(
      (await call("set_logistics_days", BUILD, tl.id)).error,
    ).toBeUndefined();
    expect(
      (
        await call(
          "clear_logistics_days",
          { phase: "build", expectedVersion: 2 },
          tl.id,
        )
      ).error,
    ).toBe(PHASE_CHANGED);
    const { data, error } = await call(
      "clear_logistics_days",
      { phase: "build", expectedVersion: 1 },
      tl.id,
    );
    expect(error).toBeUndefined();
    expect(data).toMatchObject({ phase: "build" });
    const [row] = await h.db().select().from(schema.logisticsPhases);
    expect(row).toMatchObject({
      startDate: null,
      endDate: null,
      place: null,
      note: null,
      version: 2,
    });
    expect(await auditRows("logistics.phase_cleared")).toHaveLength(1);
  });

  it("refuses a member and a lead of another team in the page's words, and clears nothing", async () => {
    await campYear();
    const tl = await leadOf("transport_and_logistics");
    await call("set_logistics_days", BUILD, tl.id);
    for (const who of [await member(), await leadOf("kitchen")]) {
      expect(
        (
          await call(
            "clear_logistics_days",
            { phase: "build", expectedVersion: 1 },
            who.id,
          )
        ).error,
      ).toMatch(onThePage(LOGISTICS_REFUSAL, "/logistics"));
    }
    const [row] = await h.db().select().from(schema.logisticsPhases);
    expect(row).toMatchObject({ startDate: "2026-04-22", version: 1 });
    expect(await auditRows("logistics.phase_cleared")).toEqual([]);
  });
});
