// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { CampConfig } from "@camp404/db/camp-config";
import {
  ALREADY_HAS_LAYOUT,
  LAYOUT_CHANGED,
  NO_EARLIER_LAYOUT,
} from "@camp404/db/camp-layout";
import * as schema from "@camp404/db/schema";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import type { Team } from "@camp404/types";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";
import { LAYOUT_REFUSAL } from "../../camp-layout-copy";
import { registerCampLayoutTools } from "../tools/camp-layout";

// The camp layout's connector tools (#271), on real Postgres (PGlite)
// through the real handlers: the page's own writes for the same person, who
// may and who is refused in what words, the versions they leave, and the
// compare-and-set on the version read.

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerCampLayoutTools({
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

const plan = (pieces: number) => ({
  plot: {
    widthM: 40,
    depthM: 30,
    north: "top",
    part: "whole",
    edges: { top: "9:00 road", right: "", bottom: "", left: "" },
  },
  pieces: Array.from({ length: pieces }, (_, i) => ({
    id: `p-${i}`,
    kind: "tent",
    label: `Tent ${i}`,
    x: i * 3,
    y: 0,
    w: 3,
    h: 3,
  })),
});

async function versions() {
  return h.db().select().from(schema.campLayoutVersions);
}

describe("camp layout tools", () => {
  it("saves the whole plan as a new version, only from the version read", async () => {
    await campYear();
    const lead = await leadOf("structures");
    const first = await call(
      "save_camp_layout",
      { layout: plan(2), expectedVersion: 0, note: "First go" },
      lead.id,
    );
    expect(first.data).toMatchObject({ version: 1 });

    const stale = await call(
      "save_camp_layout",
      { layout: plan(3), expectedVersion: 0 },
      lead.id,
    );
    expect(stale.error).toBe(LAYOUT_CHANGED);

    const second = await call(
      "save_camp_layout",
      { layout: plan(3), expectedVersion: 1 },
      lead.id,
    );
    expect(second.data).toMatchObject({ version: 2 });

    const read = await call("get_camp_layout", {}, (await member()).id);
    expect(read.data).toMatchObject({ version: 2, latestVersion: 2 });
    expect((read.data!.layout as { pieces: unknown[] }).pieces).toHaveLength(3);
    expect(read.data!.versions).toHaveLength(2);
    const old = await call("get_camp_layout", { version: 1 }, lead.id);
    expect(old.data).toMatchObject({
      version: 1,
      latestVersion: 2,
      note: "First go",
    });
  });

  it("refuses anyone but a captain or a Structures lead, and a piece off the plot", async () => {
    await campYear();
    const plain = await member();
    const kitchenLead = await leadOf("kitchen");
    for (const who of [plain, kitchenLead]) {
      expect(
        (
          await call(
            "save_camp_layout",
            { layout: plan(1), expectedVersion: 0 },
            who.id,
          )
        ).error,
      ).toContain(LAYOUT_REFUSAL);
      expect((await call("copy_last_year_layout", {}, who.id)).error).toContain(
        LAYOUT_REFUSAL,
      );
    }
    const lead = await leadOf("structures");
    const off = plan(1);
    off.pieces[0]!.x = 39;
    const refused = await call(
      "save_camp_layout",
      { layout: off, expectedVersion: 0 },
      lead.id,
    );
    expect(refused.error).toMatch(/runs off the plot/);
    expect(await versions()).toHaveLength(0);
  });

  it("restores an earlier version as the newest, and copies last year's only into an empty year", async () => {
    await campYear(2025);
    const lead = await leadOf("structures");
    expect((await call("copy_last_year_layout", {}, lead.id)).error).toBe(
      NO_EARLIER_LAYOUT,
    );
    await call(
      "save_camp_layout",
      { layout: plan(4), expectedVersion: 0 },
      lead.id,
    );

    await campYear(2026);
    const lead2026 = await leadOf("structures");
    const copied = await call("copy_last_year_layout", {}, lead2026.id);
    expect(copied.data).toMatchObject({ version: 1, fromYear: 2025 });
    expect((await call("copy_last_year_layout", {}, lead2026.id)).error).toBe(
      ALREADY_HAS_LAYOUT,
    );

    await call(
      "save_camp_layout",
      { layout: plan(1), expectedVersion: 1 },
      lead2026.id,
    );
    expect(
      (
        await call(
          "restore_camp_layout_version",
          { number: 1, expectedVersion: 1 },
          lead2026.id,
        )
      ).error,
    ).toBe(LAYOUT_CHANGED);
    const restored = await call(
      "restore_camp_layout_version",
      { number: 1, expectedVersion: 2 },
      lead2026.id,
    );
    expect(restored.data).toMatchObject({ version: 3, restored: 1 });
    const now = await call("get_camp_layout", {}, lead2026.id);
    expect((now.data!.layout as { pieces: unknown[] }).pieces).toHaveLength(4);
  });
});
