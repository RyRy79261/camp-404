import { beforeEach, describe, expect, it, vi } from "vitest";

// Who may address which audience. A captain may send to the camp or any active
// team; a team lead only to teams they lead, checked when the draft is saved
// and again, in the claim, when it is published. The data layer is mocked; the
// gate and the audience rules are what these assert.

vi.mock("@/lib/background-work", () => ({ deliverAfterResponse: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  getLeadTeams: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
  isTeamLead: vi.fn(),
}));
vi.mock("@/lib/camp-config", () => ({
  getTeamsConfig: vi.fn(async () => ({})),
  activeTeams: vi.fn(() => [
    { key: "kitchen", label: "Kitchen" },
    { key: "structures", label: "Structures" },
  ]),
}));
vi.mock("@/lib/notifications", () => ({
  countAnnouncementAudience: vi.fn(async () => 4),
  createAnnouncementDraft: vi.fn(async () => ({ id: "draft-1" })),
  deleteAnnouncementDraft: vi.fn(),
  explainDraftRefusal: vi.fn(),
  getAnnouncementPinContext: vi.fn(async () => ({
    audience: { scope: "everyone" },
    published: true,
    pinned: false,
  })),
  publishAnnouncement: vi.fn(async () => ({ ok: true, recipientCount: 4 })),
  setAnnouncementPinned: vi.fn(async () => ({ ok: true })),
  updateAnnouncementDraft: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  previewPublishAction,
  publishAction,
  saveDraftAction,
  setPinnedAction,
} from "./actions";
import { NOT_YOUR_PIN, NOT_YOUR_TEAM } from "./audience-copy";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, getLeadTeams, isTeamLead } from "@/lib/users";
import {
  countAnnouncementAudience,
  createAnnouncementDraft,
  getAnnouncementPinContext,
  publishAnnouncement,
  setAnnouncementPinned,
} from "@/lib/notifications";
import { deliverAfterResponse } from "@/lib/background-work";

const DRAFT = { title: "Prep", body: "Knives out at 4.", presentation: "feed" };

function signIn(rank: "captain" | "member", leadTeams: string[] = []) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "u@example.com",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({ id: "user-1", rank } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leadTeams);
  vi.mocked(isTeamLead).mockResolvedValue(leadTeams.length > 0);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("announcement audiences", () => {
  it("lets a captain send to the camp or any active team", async () => {
    signIn("captain");
    expect((await saveDraftAction(DRAFT)).ok).toBe(true);
    expect(createAnnouncementDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ audience: { scope: "everyone" } }),
    );
    expect(
      (
        await saveDraftAction({
          ...DRAFT,
          audience: { scope: "team", team: "structures" },
        })
      ).ok,
    ).toBe(true);
  });

  it("lets a captain address just the team leads, and refuses a lead the same", async () => {
    signIn("captain");
    expect(
      (await saveDraftAction({ ...DRAFT, audience: { scope: "team_leads" } }))
        .ok,
    ).toBe(true);
    expect(createAnnouncementDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ audience: { scope: "team_leads" } }),
    );

    vi.mocked(createAnnouncementDraft).mockClear();
    signIn("member", ["kitchen"]);
    expect(
      await saveDraftAction({ ...DRAFT, audience: { scope: "team_leads" } }),
    ).toEqual({ ok: false, error: NOT_YOUR_TEAM });
    expect(createAnnouncementDraft).not.toHaveBeenCalled();
  });

  it("refuses a captain a team that is no longer active", async () => {
    signIn("captain");
    expect(
      await saveDraftAction({
        ...DRAFT,
        audience: { scope: "team", team: "ministry_of_memes" },
      }),
    ).toEqual({
      ok: false,
      error: "That team isn't active any more. Pick another audience.",
    });
    expect(createAnnouncementDraft).not.toHaveBeenCalled();
  });

  it("lets a lead address only a team they lead", async () => {
    signIn("member", ["kitchen"]);
    expect(
      (
        await saveDraftAction({
          ...DRAFT,
          audience: { scope: "team", team: "kitchen" },
        })
      ).ok,
    ).toBe(true);
    for (const audience of [
      { scope: "everyone" },
      { scope: "team", team: "structures" },
    ]) {
      expect(await saveDraftAction({ ...DRAFT, audience })).toEqual({
        ok: false,
        error: NOT_YOUR_TEAM,
      });
      expect(await previewPublishAction(audience)).toEqual({
        ok: false,
        error: NOT_YOUR_TEAM,
      });
    }
    expect(createAnnouncementDraft).toHaveBeenCalledTimes(1);
  });

  it("refuses a member who leads nothing", async () => {
    signIn("member", []);
    expect(await saveDraftAction(DRAFT)).toEqual({
      ok: false,
      error: "Captains and team leads only.",
    });
  });

  // The gate's snapshot of rank and teams must not reach the write: the write
  // reads them itself, under lock, so a stale answer cannot authorise it.
  it("hands the publish write no snapshot of the sender's reach", async () => {
    for (const [rank, teams] of [
      ["member", ["kitchen"]],
      ["captain", []],
    ] as const) {
      signIn(rank, [...teams]);
      await publishAction("draft-1");
      expect(publishAnnouncement).toHaveBeenLastCalledWith({
        id: "draft-1",
        senderId: "user-1",
      });
    }
    // No cron: each publish sends its notices after the response.
    expect(deliverAfterResponse).toHaveBeenCalledTimes(2);
  });

  it("counts the audience the draft is for", async () => {
    signIn("captain");
    const audience = { scope: "team", team: "kitchen" };
    expect(await previewPublishAction(audience)).toEqual({
      ok: true,
      data: { recipientCount: 4 },
    });
    expect(countAnnouncementAudience).toHaveBeenCalledWith("user-1", audience);
    expect((await previewPublishAction({ scope: "nobody" })).ok).toBe(false);
  });
});

// Pinning authority follows posting authority (owner's call, 2026-09-22). The
// audience the action asks about is the one STORED on the announcement, never
// one the browser sent, and a lead's teams ride into the write so the claim can
// re-check them.
describe("pinning an announcement", () => {
  const pinContext = (audience: unknown) =>
    vi.mocked(getAnnouncementPinContext).mockResolvedValue({
      audience,
      published: true,
      pinned: false,
    } as never);

  it("lets a captain pin anything they could have posted", async () => {
    signIn("captain");
    pinContext({ scope: "everyone" });
    expect(await setPinnedAction("b1", true)).toEqual({ ok: true });
    expect(setAnnouncementPinned).toHaveBeenLastCalledWith({
      id: "b1",
      actorId: "user-1",
      pinned: true,
    });
  });

  it("lets a lead pin their own team's announcement, and leaves the teams to the write", async () => {
    signIn("member", ["kitchen"]);
    pinContext({ scope: "team", team: "kitchen" });
    expect(await setPinnedAction("b2", true)).toEqual({ ok: true });
    expect(setAnnouncementPinned).toHaveBeenLastCalledWith({
      id: "b2",
      actorId: "user-1",
      pinned: true,
    });
  });

  it("refuses a lead a camp-wide pin, or another team's — before any write", async () => {
    signIn("member", ["kitchen"]);
    for (const audience of [
      { scope: "everyone" },
      { scope: "team", team: "structures" },
    ]) {
      pinContext(audience);
      expect(await setPinnedAction("b3", true)).toEqual({
        ok: false,
        error: NOT_YOUR_PIN,
      });
    }
    expect(setAnnouncementPinned).not.toHaveBeenCalled();
  });

  it("refuses a member who leads nothing, and an announcement that is gone", async () => {
    signIn("member", []);
    pinContext({ scope: "everyone" });
    expect(await setPinnedAction("b4", true)).toEqual({
      ok: false,
      error: "Captains and team leads only.",
    });

    signIn("captain");
    vi.mocked(getAnnouncementPinContext).mockResolvedValue(null);
    expect(await setPinnedAction("b4", true)).toEqual({
      ok: false,
      error: "That announcement no longer exists.",
    });
    expect(setAnnouncementPinned).not.toHaveBeenCalled();
  });

  it("refuses a captain a new pin on a team that is no longer active, and still lets them take one down", async () => {
    signIn("captain");
    pinContext({ scope: "team", team: "ministry_of_memes" });
    expect(await setPinnedAction("b6", true)).toEqual({
      ok: false,
      error: "That team isn't active any more. Pick another audience.",
    });
    expect(setAnnouncementPinned).not.toHaveBeenCalled();

    // An active team goes through, so the refusal above is the team, not the
    // captain.
    pinContext({ scope: "team", team: "kitchen" });
    expect(await setPinnedAction("b6", true)).toEqual({ ok: true });

    // A pin must always be removable, whatever became of its team.
    pinContext({ scope: "team", team: "ministry_of_memes" });
    expect(await setPinnedAction("b6", false)).toEqual({ ok: true });
    expect(setAnnouncementPinned).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "b6", pinned: false }),
    );
  });

  it("unpins through the same gate", async () => {
    signIn("member", ["kitchen"]);
    pinContext({ scope: "team", team: "kitchen" });
    expect(await setPinnedAction("b5", false)).toEqual({ ok: true });
    expect(setAnnouncementPinned).toHaveBeenLastCalledWith({
      id: "b5",
      actorId: "user-1",
      pinned: false,
    });
  });
});
