// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { getJoinEditorData, saveJoinSections } from "../../join-site";
import { sectionVersion } from "../../mcp/tools/join-site";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";
import type { McpScope } from "../../mcp/scope";

vi.mock("next/server", () => ({ after: () => undefined }));

import { JOIN_SITE_PREVIEWS as P } from "../previews-join-site";

// The voice rows for the join site's words (previews-join-site.ts), read from
// real rows (PGlite): they say the words go public, and run on the version
// stored now.

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

const SCOPE: McpScope = {
  campUserId: "11111111-1111-4111-8111-111111111111",
  rank: "captain",
  viewerRank: "captain",
  leadTeams: [],
  memberTeams: [],
  isDriver: false,
  isCaptain: true,
};
const ctx = { scope: SCOPE, now: new Date("2026-10-06T10:00:00Z") };

describe("join site previews", () => {
  it("fills in the section's version as stored now and says it goes public", async () => {
    const cap = await makeUser(h.db(), { rank: "captain" });
    const before = await getJoinEditorData();
    await saveJoinSections({
      year: before.year,
      sections: { apply: { ...before.content.apply, button: "Now" } },
      actorUserId: cap.id,
    });
    const now = (await getJoinEditorData()).content.apply;
    const p = await P.update_join_page_section!(
      {
        section: "apply",
        content: { ...now, button: "Later" },
        expectedVersion: sectionVersion(before.content.apply),
      },
      ctx,
    );
    expect(p.args.expectedVersion).toBe(sectionVersion(now));
    expect(p.facts).toContain("public join.camp-404.com");
    expect(p.change).toContain("button: “Later”");
  });

  it("blocks the fee section and an unknown team", async () => {
    const fee = await P.update_join_page_section!(
      { section: "fee", content: {}, expectedVersion: "x" },
      ctx,
    );
    expect(fee.blocked).toBeDefined();
    const team = await P.update_join_team_line!(
      { team: "nope", line: "x", expected: "" },
      ctx,
    );
    expect(team.blocked).toBe("Unknown team.");
    const kitchen = await P.update_join_team_line!(
      { team: "kitchen", line: "We cook.", expected: "stale" },
      ctx,
    );
    expect(kitchen.args.expected).toBe("");
    expect(kitchen.change).toEqual(["Line: “We cook.”"]);
  });
});
