// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";
import type { McpScope } from "../../mcp/scope";

vi.mock("next/server", () => ({ after: () => undefined }));

import { CAPTAIN_PEOPLE_PREVIEWS as P } from "../previews-captain-people";

// The voice rows for captains' notes and tickets (previews-captain-people.ts),
// read from real rows (PGlite): the member named from the roster, and the
// ticket change run on the value stored now.

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

describe("captain people previews", () => {
  it("names the member a note is for, and blocks an unknown one", async () => {
    const grace = await makeUser(h.db(), { displayName: "Grace" });
    const p = await P.add_member_note!(
      { userId: grace.id, body: "Welds." },
      ctx,
    );
    expect(p.sentence).toBe("Add a captains' note to Grace");
    expect(p.change).toEqual(["Note: “Welds.”"]);
    const gone = await P.add_member_note!(
      { userId: "00000000-0000-4000-8000-000000000000", body: "x" },
      ctx,
    );
    expect(gone.blocked).toBe("Member not found.");
  });

  it("fills in the stored value as `from`, whatever Claude passed", async () => {
    const grace = await makeUser(h.db(), { displayName: "Grace" });
    await h
      .db()
      .insert(schema.campTickets)
      .values({ userId: grace.id, cycle: 1, wap: "requested" });
    const p = await P.set_ticket_pass!(
      { userId: grace.id, pass: "wap", from: "not_needed", to: "issued" },
      ctx,
    );
    expect(p.args.from).toBe("requested");
    expect(p.sentence).toBe("Set Grace's WAP to “Issued”");
    expect(p.facts).toContain("now “Requested”");
  });

  it("blocks a ticket status for someone not coming", async () => {
    const grace = await makeUser(h.db());
    const p = await P.set_ticket_pass!(
      { userId: grace.id, pass: "ticket", from: "unknown", to: "has_ticket" },
      ctx,
    );
    expect(p.blocked).toBe(
      "They have to say Coming or Maybe before a ticket can be recorded.",
    );
  });
});
