// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lounge", () => ({
  getLoungeProgramme: vi.fn(async () => ({ offers: [], slots: [] })),
  getLoungeSettings: vi.fn(),
  listMyLoungeOffers: vi.fn(async () => []),
  listLoungeOffers: vi.fn(async () => []),
}));
vi.mock("../../camp-config", () => ({
  getCampSettings: vi.fn(async () => ({
    current: {
      year: 2027,
      burnStart: "2027-04-26",
      burnEnd: "2027-05-02",
    },
  })),
}));

import { OFFER_DECIDED } from "@camp404/core";
import type { McpScope } from "../../mcp/scope";
import {
  getLoungeProgramme,
  getLoungeSettings,
  listLoungeOffers,
  listMyLoungeOffers,
  type LoungeOfferRow,
} from "../../lounge";
import { LOUNGE_PREVIEWS } from "../previews-lounge";

// The lounge's voice previews: the sentence and facts come from the offer
// read on the server, the compare-and-set values are the row's own, and an
// offer that is not there, not the caller's, or not theirs to run is blocked.

const ME = "11111111-1111-4111-8111-111111111111";
const OFFER = "22222222-2222-4222-8222-222222222222";

const member: McpScope = {
  campUserId: ME,
  rank: "member",
  viewerRank: "camp_member",
  leadTeams: [],
  memberTeams: [],
  isDriver: false,
  isCaptain: false,
};
const vibesLead: McpScope = {
  ...member,
  viewerRank: "team_lead",
  leadTeams: ["ministry_of_vibes"],
  memberTeams: ["ministry_of_vibes"],
};
const at = (scope: McpScope) => ({
  scope,
  now: new Date("2027-04-01T10:00:00Z"),
});

function offer(over: Partial<LoungeOfferRow> = {}): LoungeOfferRow {
  return {
    id: OFFER,
    cycle: 2027,
    hostId: ME,
    hostName: "Dee Mokoena",
    kind: "dj_set",
    title: "Sunset vinyl",
    description: null,
    durationMinutes: 90,
    needs: [],
    needsNote: null,
    preferredDays: [],
    preferredBands: [],
    recurring: false,
    publicGuide: false,
    status: "offered",
    decisionNote: null,
    decidedAt: null,
    version: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("lounge previews", () => {
  it("changes your own offer at the version read, and shows what changes", async () => {
    vi.mocked(listMyLoungeOffers).mockResolvedValue([offer()]);
    const p = await LOUNGE_PREVIEWS.update_my_lounge_offer!(
      { offerId: OFFER, expectedVersion: 1, preferredDays: [3] },
      at(member),
    );
    expect(p.blocked).toBeUndefined();
    expect(p.sentence).toBe("Change your lounge offer “Sunset vinyl”");
    expect(p.args).toMatchObject({ expectedVersion: 3 });
    expect(p.change).toEqual(["Days: Day 3 · Wed 28 Apr"]);
  });

  it("blocks a change to a decided offer, and to someone else's", async () => {
    vi.mocked(listMyLoungeOffers).mockResolvedValue([
      offer({ status: "accepted" }),
    ]);
    const decided = await LOUNGE_PREVIEWS.update_my_lounge_offer!(
      { offerId: OFFER, expectedVersion: 3, title: "Late vinyl" },
      at(member),
    );
    expect(decided.blocked).toBe(OFFER_DECIDED);
    vi.mocked(listMyLoungeOffers).mockResolvedValue([]);
    const notMine = await LOUNGE_PREVIEWS.withdraw_my_lounge_offer!(
      { offerId: OFFER },
      at(member),
    );
    expect(notMine.blocked).toBe("That offer isn't one of yours.");
  });

  it("decides on the status and version read, naming the host", async () => {
    vi.mocked(listLoungeOffers).mockResolvedValue([offer()]);
    const p = await LOUNGE_PREVIEWS.decide_lounge_offer!(
      {
        offerId: OFFER,
        decision: "needs_changes",
        expectedStatus: "accepted",
        expectedVersion: 1,
        reason: "Shorter, please",
      },
      at(vibesLead),
    );
    expect(p.blocked).toBeUndefined();
    expect(p.sentence).toBe("Send back “Sunset vinyl” by Dee Mokoena");
    expect(p.args).toMatchObject({
      expectedStatus: "offered",
      expectedVersion: 3,
    });
    expect(p.change).toEqual(["Reason: “Shorter, please”"]);

    const plain = await LOUNGE_PREVIEWS.decide_lounge_offer!(
      { offerId: OFFER, decision: "accepted" },
      at(member),
    );
    expect(plain.blocked).toMatch(/Only captains and Ministry of Vibes leads/);
  });

  it("places only an accepted offer, with its day and time", async () => {
    vi.mocked(listLoungeOffers).mockResolvedValue([
      offer({ status: "accepted" }),
    ]);
    const p = await LOUNGE_PREVIEWS.place_lounge_offer!(
      { offerId: OFFER, day: 2, startMinute: 18 * 60 },
      at(vibesLead),
    );
    expect(p.blocked).toBeUndefined();
    expect(p.sentence).toBe(
      "Put “Sunset vinyl” on the programme, Day 2 · Tue 27 Apr 18:00–19:30",
    );
    vi.mocked(listLoungeOffers).mockResolvedValue([offer()]);
    const waiting = await LOUNGE_PREVIEWS.place_lounge_offer!(
      { offerId: OFFER, day: 2, startMinute: 18 * 60 },
      at(vibesLead),
    );
    expect(waiting.blocked).toBe(
      "Only an accepted offer can go on the programme.",
    );
  });

  it("fills the music note's version from what is saved", async () => {
    vi.mocked(getLoungeSettings).mockResolvedValue({
      cycle: 2027,
      musicPolicy: "No trance",
      version: 4,
    });
    const p = await LOUNGE_PREVIEWS.set_lounge_music_note!(
      { musicPolicy: "Anything goes", expectedVersion: 0 },
      at(vibesLead),
    );
    expect(p.args).toEqual({
      musicPolicy: "Anything goes",
      expectedVersion: 4,
    });
    expect(p.change).toEqual(["Music note: “Anything goes”"]);
    expect(vi.mocked(getLoungeProgramme)).not.toHaveBeenCalled();
  });
});
