// @vitest-environment node
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import { DRAFT_NOT_YOURS } from "@camp404/db/broadcasts";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";
import { NOT_YOUR_PIN, NOT_YOUR_TEAM } from "@/lib/announcement-audience-copy";
import { createAnnouncementDraft } from "../../notifications";
import type { McpScope } from "../../mcp/scope";

vi.mock("next/server", () => ({ after: () => undefined }));

import { ANNOUNCEMENTS_PREVIEWS as P } from "../previews-announcements";

// The voice rows for announcement drafts and pins (previews-announcements.ts),
// read from real rows (PGlite): the draft's own title, who it is for, and the
// tool's refusals as blocked rows.

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

function scopeOf(id: string, lead?: "kitchen"): McpScope {
  return {
    campUserId: id,
    rank: lead ? "member" : "captain",
    viewerRank: lead ? "team_lead" : "captain",
    leadTeams: lead ? [lead] : [],
    memberTeams: lead ? [lead] : [],
    isDriver: false,
    isCaptain: !lead,
  };
}
const now = new Date("2026-10-06T10:00:00Z");

describe("announcement previews", () => {
  it("blocks a lead's camp-wide draft, and says a team draft sends nothing", async () => {
    const lead = await makeUser(h.db());
    const ctx = { scope: scopeOf(lead.id, "kitchen"), now };
    const wide = await P.save_announcement_draft!(
      { title: "Hi", body: "x" },
      ctx,
    );
    expect(wide.blocked).toBe(NOT_YOUR_TEAM);
    const team = await P.save_announcement_draft!(
      { title: "Hi", body: "x", audience: { scope: "team", team: "kitchen" } },
      ctx,
    );
    expect(team.blocked).toBeUndefined();
    expect(team.facts).toContain("nothing sent");
  });

  it("names the draft from its row, and blocks someone else's", async () => {
    const cap = await makeUser(h.db(), { rank: "captain" });
    const other = await makeUser(h.db(), { rank: "captain" });
    const { id } = await createAnnouncementDraft({
      senderId: cap.id,
      title: "Gate times",
      body: "9",
      presentation: "feed",
      audience: { scope: "everyone" },
      pinned: false,
    });
    const p = await P.update_announcement_draft!(
      { id, body: "10" },
      { scope: scopeOf(cap.id), now },
    );
    expect(p.sentence).toBe("Change the draft “Gate times”");
    expect(p.change).toEqual(["Words: “10”"]);
    const theirs = await P.update_announcement_draft!(
      { id, body: "10" },
      { scope: scopeOf(other.id), now },
    );
    expect(theirs.blocked).toBe(DRAFT_NOT_YOURS);
  });

  it("blocks a pin on a draft and a lead's pin on a camp-wide one", async () => {
    const cap = await makeUser(h.db(), { rank: "captain" });
    const lead = await makeUser(h.db());
    const { id } = await createAnnouncementDraft({
      senderId: cap.id,
      title: "Rules",
      body: "x",
      presentation: "feed",
      audience: { scope: "everyone" },
      pinned: false,
    });
    const draft = await P.set_announcement_pinned!(
      { id, pinned: true },
      { scope: scopeOf(cap.id), now },
    );
    expect(draft.blocked).toBe("Only a published announcement can be pinned.");
    await h
      .db()
      .update(schema.broadcasts)
      .set({ publishedAt: new Date() })
      .where(eq(schema.broadcasts.id, id));
    const ok = await P.set_announcement_pinned!(
      { id, pinned: true },
      { scope: scopeOf(cap.id), now },
    );
    expect(ok.sentence).toBe("Pin “Rules”");
    expect(ok.facts).toContain("sends nothing");
    const notYours = await P.set_announcement_pinned!(
      { id, pinned: true },
      { scope: scopeOf(lead.id, "kitchen"), now },
    );
    expect(notYours.blocked).toBe(NOT_YOUR_PIN);
  });
});
