import { beforeEach, describe, expect, it, vi } from "vitest";

// Who may address which audience. A captain may send to the camp or any active
// team; a team lead only to teams they lead, checked when the draft is saved
// and again, in the claim, when it is published. The data layer is mocked; the
// gate and the audience rules are what these assert.

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
  publishAnnouncement: vi.fn(async () => ({ ok: true, recipientCount: 4 })),
  updateAnnouncementDraft: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { previewPublishAction, publishAction, saveDraftAction } from "./actions";
import { NOT_YOUR_TEAM } from "./audience-copy";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, getLeadTeams, isTeamLead } from "@/lib/users";
import {
  countAnnouncementAudience,
  createAnnouncementDraft,
  publishAnnouncement,
} from "@/lib/notifications";

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

  it("limits a lead's publish to their teams in the claim; a captain's is open", async () => {
    signIn("member", ["kitchen"]);
    await publishAction("draft-1");
    expect(publishAnnouncement).toHaveBeenLastCalledWith({
      id: "draft-1",
      senderId: "user-1",
      allowedTeams: ["kitchen"],
    });

    signIn("captain");
    await publishAction("draft-1");
    expect(publishAnnouncement).toHaveBeenLastCalledWith({
      id: "draft-1",
      senderId: "user-1",
      allowedTeams: undefined,
    });
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
