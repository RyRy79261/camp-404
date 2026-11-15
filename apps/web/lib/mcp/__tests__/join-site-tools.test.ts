// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import { getJoinSitePublic } from "@camp404/db/join-site";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";

vi.mock("next/server", () => ({ after: () => undefined }));

import {
  FEE_ONLY,
  registerJoinSiteTools,
  SECTION_CHANGED,
  TEAM_LINE_CHANGED,
} from "../tools/join-site";

// join.camp-404.com's words over the connector (tools/join-site.ts), against
// real Postgres (PGlite) through the real handlers: captains only, a section
// checked by its own schema and audited, refused when it changed since it was
// read, the fee section kept off, and what the public site then reads.

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerJoinSiteTools({
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

const captain = () =>
  makeUser(h.db(), { approvalStatus: "approved", rank: "captain" });

type Sections = Record<
  string,
  { content: Record<string, unknown>; version: string }
>;

async function read(as: string) {
  const res = await call("get_join_page", {}, as);
  return res.data as {
    sections: Sections;
    teams: { team: string; line: string }[];
  };
}

describe("update_join_page_section", () => {
  it("replaces a section on the version read, audited, and the public site reads it", async () => {
    const cap = await captain();
    const page = await read(cap.id);
    const apply = page.sections.apply!;
    const res = await call(
      "update_join_page_section",
      {
        section: "apply",
        content: { ...apply.content, button: "Come with us" },
        expectedVersion: apply.version,
      },
      cap.id,
    );
    expect(res.data).toMatchObject({ section: "apply" });
    expect(res.data!.version).not.toBe(apply.version);
    const live = await getJoinSitePublic();
    expect(live.content.apply.button).toBe("Come with us");
    const audit = await h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "join_site.section_saved"));
    expect(audit.map((r) => [r.actorId, r.metadata])).toEqual([
      [cap.id, { section: "apply", year: 1 }],
    ]);

    // The old version is now stale.
    const stale = await call(
      "update_join_page_section",
      {
        section: "apply",
        content: { ...apply.content, button: "Again" },
        expectedVersion: apply.version,
      },
      cap.id,
    );
    expect(stale).toEqual({ error: SECTION_CHANGED });
    expect((await getJoinSitePublic()).content.apply.button).toBe(
      "Come with us",
    );
  });

  it("refuses a section its schema refuses, naming it, and saves nothing", async () => {
    const cap = await captain();
    const page = await read(cap.id);
    const res = await call(
      "update_join_page_section",
      {
        section: "apply",
        content: { ...page.sections.apply!.content, button: "" },
        expectedVersion: page.sections.apply!.version,
      },
      cap.id,
    );
    expect(res.error).toMatch(/^apply: /);
    expect(await h.db().select().from(schema.joinSiteContent)).toEqual([]);
  });

  it("keeps the fee section and everyone but a captain off", async () => {
    const cap = await captain();
    const lead = await makeUser(h.db(), { approvalStatus: "approved" });
    await makeMembership(h.db(), {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    const page = await read(cap.id);
    const fee = await call(
      "update_join_page_section",
      {
        section: "fee",
        content: page.sections.fee!.content,
        expectedVersion: page.sections.fee!.version,
      },
      cap.id,
    );
    expect(fee).toEqual({ error: FEE_ONLY });
    for (const name of ["get_join_page", "update_join_page_section"]) {
      const res = await call(
        name,
        {
          section: "apply",
          content: page.sections.apply!.content,
          expectedVersion: page.sections.apply!.version,
        },
        lead.id,
      );
      expect(res.error).toMatch(/^Only a captain can do this\./);
    }
    expect(await h.db().select().from(schema.joinSiteContent)).toEqual([]);
  });
});

describe("update_join_team_line", () => {
  it("changes a team's line on the line read, and refuses a stale one", async () => {
    const cap = await captain();
    const page = await read(cap.id);
    const kitchen = page.teams.find((t) => t.team === "kitchen")!;
    const res = await call(
      "update_join_team_line",
      { team: "kitchen", line: "We feed the camp.", expected: kitchen.line },
      cap.id,
    );
    expect(res.data).toMatchObject({ line: "We feed the camp." });
    const live = await getJoinSitePublic();
    expect(live.teams.find((t) => t.key === "kitchen")!.description).toBe(
      "We feed the camp.",
    );
    expect(
      await call(
        "update_join_team_line",
        { team: "kitchen", line: "Other", expected: kitchen.line },
        cap.id,
      ),
    ).toEqual({ error: TEAM_LINE_CHANGED });
    expect(
      await call(
        "update_join_team_line",
        { team: "nope", line: "x", expected: "" },
        cap.id,
      ),
    ).toEqual({ error: "Unknown team." });
  });
});
