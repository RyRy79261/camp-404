import { describe, expect, it } from "vitest";
import {
  COMMS_LINKS,
  COMMS_MEMBER_NOTE,
  commsGlance,
  type CommsGlanceInput,
} from "../team-glance/comms";

// The Communications & HR team page's panel: the open sends and the month's
// announcements for everyone; Ol' Jeb's reach and the sign-ups waiting only
// when the server read them for this viewer.

const base: CommsGlanceInput = {
  sends: [
    { key: "a1", title: "Coming this year?", completed: 34, eligible: 48 },
    { key: "a2", title: "Kitchen helpers", completed: 12, eligible: 12 },
  ],
  announcementsThisMonth: 6,
  telegram: null,
  pendingApprovals: null,
  canAnnounce: false,
  isCaptain: false,
};

describe("commsGlance", () => {
  it("gives a member the sends and the announcements, and nothing waiting", () => {
    const g = commsGlance(base);
    expect(g.tiles.map((t) => t.key)).toEqual(["sends", "announcements"]);
    expect(g.tiles[0]).toMatchObject({
      value: "2",
      hint: "1 still waiting on answers",
    });
    expect(g.bars![0]!.rows).toEqual([
      expect.objectContaining({
        label: "Coming this year?",
        value: "34 of 48",
      }),
      expect.objectContaining({ label: "Kitchen helpers", value: "12 of 12" }),
    ]);
    expect(g.attention.map((a) => a.text)).toEqual([
      "Coming this year?: 14 people have not answered.",
    ]);
    expect(g.links).toEqual([COMMS_LINKS.questionnaires]);
    expect(g.note).toBe(COMMS_MEMBER_NOTE);
  });

  it("adds Ol' Jeb's reach and the sign-ups waiting for those who may read them", () => {
    const g = commsGlance({
      ...base,
      telegram: { connected: 22, members: 48 },
      pendingApprovals: 3,
      canAnnounce: true,
      isCaptain: true,
    });
    const byKey = Object.fromEntries(g.tiles.map((t) => [t.key, t]));
    expect(byKey.telegram).toMatchObject({
      value: "22 of 48",
      progress: { value: 22, max: 48 },
    });
    expect(byKey.approvals).toMatchObject({ value: "3", tone: "warn" });
    expect(g.attention[0]!.text).toBe(
      "3 new sign-ups wait for a captain's approval.",
    );
    expect(g.links).toEqual([
      COMMS_LINKS.announcements,
      COMMS_LINKS.questionnaires,
      COMMS_LINKS.joinSite,
    ]);
    expect(g.note).toBeUndefined();
  });

  it("leaves the sends out where they are not known", () => {
    const g = commsGlance({ ...base, sends: null });
    expect(g.tiles.map((t) => t.key)).toEqual(["announcements"]);
    expect(g.bars).toBeUndefined();
  });
});
