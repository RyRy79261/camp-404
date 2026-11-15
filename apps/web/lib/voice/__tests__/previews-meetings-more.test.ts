// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../mcp/tools/meetings-more", () => ({ findMeeting: vi.fn() }));
vi.mock("../reads", () => ({
  readNames: vi.fn(
    async () =>
      new Map([
        ["u-cook", "Cee Cook"],
        ["u-lead", "Lee Lead"],
      ]),
  ),
  readTeamLabels: vi.fn(async () => ({ kitchen: "Kitchen" })),
}));

import { findMeeting } from "../../mcp/tools/meetings-more";
import type { McpScope } from "../../mcp/scope";
import { MEETINGS_MORE_PREVIEWS } from "../previews-meetings-more";

const scope = (over: Partial<McpScope> = {}): McpScope => ({
  campUserId: "11111111-1111-4111-8111-111111111111",
  rank: "member",
  viewerRank: "camp_member",
  leadTeams: [],
  memberTeams: ["kitchen"],
  isDriver: false,
  isCaptain: false,
  ...over,
});
const now = new Date("2026-10-06T10:00:00Z");
const ENTRY = { id: "evt1", title: "Menu planning", startDay: "2027-03-01" };

describe("save_meeting_minutes preview", () => {
  it("names the meeting from the calendar, lists the changes and fills in the version", async () => {
    vi.mocked(findMeeting).mockResolvedValue({
      entry: ENTRY,
      note: { id: "n1", version: 7, actionItems: [{ id: "a1" }] },
      hasMinutes: true,
      team: "kitchen",
    } as never);
    const p = await MEETINGS_MORE_PREVIEWS.save_meeting_minutes!(
      {
        eventId: "evt1",
        expectedVersion: 1,
        attendeeIds: ["u-cook", "u-lead"],
        actionItems: [
          { id: "a1", text: "Buy oats", assigneeId: "u-cook" },
          { text: "Book the van", due: "2027-03-05" },
        ],
      },
      { scope: scope(), now },
    );
    expect(p.sentence).toBe("Change the minutes of “Menu planning”");
    expect(p.facts).toContain("1 new action item go on the task board");
    expect(p.change).toEqual([
      "Who was there (the whole list): Cee Cook · Lee Lead",
      "Action items (the whole list): “Buy oats” (Cee Cook, Kitchen, no deadline) · “Book the van” (nobody yet, Kitchen, due Fri 5 Mar)",
    ]);
    expect(p.args).toMatchObject({ eventId: "evt1", expectedVersion: 7 });
    expect(p.keys).toEqual(["meeting:n1"]);
    expect(p.blocked).toBeUndefined();
  });

  it("writes the first minutes with no version, and blocks someone outside the team", async () => {
    vi.mocked(findMeeting).mockResolvedValue({
      entry: ENTRY,
      note: null,
      hasMinutes: true,
      team: "kitchen",
    } as never);
    const p = await MEETINGS_MORE_PREVIEWS.save_meeting_minutes!(
      { eventId: "evt1", expectedVersion: 3, notes: "Oats." },
      { scope: scope(), now },
    );
    expect(p.sentence).toBe("Write the first minutes of “Menu planning”");
    expect(p.args).toMatchObject({ expectedVersion: null });
    expect(
      (
        await MEETINGS_MORE_PREVIEWS.save_meeting_minutes!(
          { eventId: "evt1", notes: "Oats." },
          { scope: scope({ memberTeams: [] }), now },
        )
      ).blocked,
    ).toBe("Only Kitchen's members this year and captains write its minutes.");
  });

  it("blocks an event that is not a meeting, and one not on the calendar", async () => {
    vi.mocked(findMeeting).mockResolvedValue({
      entry: ENTRY,
      note: null,
      hasMinutes: false,
      team: null,
    } as never);
    expect(
      (
        await MEETINGS_MORE_PREVIEWS.save_meeting_minutes!(
          { eventId: "evt1", notes: "x" },
          { scope: scope({ isCaptain: true, viewerRank: "captain" }), now },
        )
      ).blocked,
    ).toBe("Only a meeting has minutes.");
    vi.mocked(findMeeting).mockResolvedValue(null);
    expect(
      (
        await MEETINGS_MORE_PREVIEWS.save_meeting_minutes!(
          { eventId: "gone", notes: "x" },
          { scope: scope(), now },
        )
      ).blocked,
    ).toBe("That meeting isn't on the calendar.");
  });
});
