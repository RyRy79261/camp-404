// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";
import type { McpScope } from "../../mcp/scope";

vi.mock("next/server", () => ({ after: () => undefined }));

import { PROFILE_MORE_PREVIEWS as P } from "../previews-profile-more";

// The voice rows for the person's own profile (previews-profile-more.ts),
// read from real rows (PGlite): what changes from what, and a blocked row
// where the tool would refuse.

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

function scopeOf(id: string, captain = false): McpScope {
  return {
    campUserId: id,
    rank: captain ? "captain" : "member",
    viewerRank: captain ? "captain" : "camp_member",
    leadTeams: [],
    memberTeams: [],
    isDriver: false,
    isCaptain: captain,
  };
}
const now = new Date("2026-10-06T10:00:00Z");

describe("profile previews", () => {
  it("names the old and new name", async () => {
    const me = await makeUser(h.db(), { displayName: "Dee" });
    const p = await P.set_my_display_name!(
      { displayName: "Dee M." },
      { scope: scopeOf(me.id), now },
    );
    expect(p.blocked).toBeUndefined();
    expect(p.facts).toContain("“Dee”");
    expect(p.change).toEqual(["Name: “Dee M.”"]);
  });

  it("blocks a member's join card and says when a captain's goes public", async () => {
    const me = await makeUser(h.db());
    const cap = await makeUser(h.db(), { rank: "captain", showOnJoin: true });
    const blocked = await P.update_my_camp_blurb!(
      { showOnJoin: true },
      { scope: scopeOf(me.id), now },
    );
    expect(blocked.blocked).toBe(
      "Only a captain's card is shown on join.camp-404.com.",
    );
    const shown = await P.update_my_camp_blurb!(
      { blurb: "Hi" },
      { scope: scopeOf(cap.id, true), now },
    );
    expect(shown.facts).toContain("public join.camp-404.com");
    expect(shown.change).toEqual(["Blurb: “Hi”"]);
  });

  it("blocks a ticket before the member says they're coming", async () => {
    const me = await makeUser(h.db());
    const before = await P.set_my_ticket_status!(
      { ticketStatus: "has_ticket" },
      { scope: scopeOf(me.id), now },
    );
    expect(before.blocked).toBe(
      "Say you're coming this year first, then add your ticket.",
    );
    await h
      .db()
      .insert(schema.campParticipations)
      .values({ userId: me.id, cycle: 1, status: "maybe", intent: "maybe" });
    const after = await P.set_my_ticket_status!(
      { ticketStatus: "has_ticket" },
      { scope: scopeOf(me.id), now },
    );
    expect(after.blocked).toBeUndefined();
    expect(after.sentence).toBe("Say your ticket: “I have my ticket”");
  });

  it("says the Telegram choice and that it is not connected yet", async () => {
    const me = await makeUser(h.db());
    const p = await P.set_my_telegram_notices!(
      { notices: "all" },
      { scope: scopeOf(me.id), now },
    );
    expect(p.sentence).toContain("all your notices");
    expect(p.facts).toContain("not connected yet");
  });
});
