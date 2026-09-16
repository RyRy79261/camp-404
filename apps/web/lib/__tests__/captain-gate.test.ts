import { beforeEach, describe, expect, it, vi } from "vitest";

// The one gate behind every captain-console page and action. The member ladder
// and the users helpers are mocked; what these assert is the order of the
// checks, the refusal copy, and that the team-lead flag is read only when it
// can change the answer.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/member-gate", () => ({ requireMemberPage: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
  isApproved: vi.fn(),
  isTeamLead: vi.fn(),
}));

import { getAuthenticatedUser } from "@/lib/auth";
import { requireMemberPage } from "@/lib/member-gate";
import {
  ensureCampUser,
  hasCampAccess,
  isApproved,
  isTeamLead,
} from "@/lib/users";
import { captainActionGate, captainPageGate } from "../captain-gate";

const AUTH = { id: "auth-1", primaryEmail: "u@example.com" };

function asPageViewer(rank: "captain" | "member", lead = false) {
  vi.mocked(requireMemberPage).mockResolvedValue({
    authUser: AUTH,
    campUser: { id: "user-1", rank },
  } as never);
  vi.mocked(isTeamLead).mockResolvedValue(lead);
}

function asActionViewer(rank: "captain" | "member", lead = false) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(AUTH as never);
  vi.mocked(ensureCampUser).mockResolvedValue({ id: "user-1", rank } as never);
  vi.mocked(isTeamLead).mockResolvedValue(lead);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
});

describe("captainPageGate", () => {
  it("walks the member ladder first, so a blocked viewer never reaches clearance", async () => {
    vi.mocked(requireMemberPage).mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(captainPageGate("captain")).rejects.toThrow("NEXT_REDIRECT");
    expect(isTeamLead).not.toHaveBeenCalled();
  });

  it("clears a captain for a captain page without reading the lead flag", async () => {
    asPageViewer("captain");

    expect(await captainPageGate("captain")).toMatchObject({
      rank: "captain",
      cleared: true,
    });
    expect(isTeamLead).not.toHaveBeenCalled();
  });

  it("locks a member out of a captain page without reading the lead flag", async () => {
    asPageViewer("member", true);

    expect(await captainPageGate("captain")).toMatchObject({ cleared: false });
    expect(isTeamLead).not.toHaveBeenCalled();
  });

  it("reads the real lead flag for a team-lead page", async () => {
    asPageViewer("member", true);

    expect(await captainPageGate("team_lead")).toMatchObject({
      rank: "team_lead",
      cleared: true,
    });
    expect(isTeamLead).toHaveBeenCalledWith("user-1");
  });

  it("locks a plain member out of a team-lead page", async () => {
    asPageViewer("member", false);

    expect(await captainPageGate("team_lead")).toMatchObject({
      rank: "camp_member",
      cleared: false,
    });
  });
});

describe("captainActionGate", () => {
  it("refuses a signed-out caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    expect(await captainActionGate("captain")).toEqual({
      ok: false,
      error: "Not signed in.",
    });
  });

  it("refuses a caller with no invite, before approval", async () => {
    asActionViewer("captain");
    vi.mocked(hasCampAccess).mockReturnValue(false);
    vi.mocked(isApproved).mockReturnValue(false);

    expect(await captainActionGate("captain")).toEqual({
      ok: false,
      error: "Your account isn't camp-active yet.",
    });
  });

  it("refuses a captain still awaiting approval", async () => {
    asActionViewer("captain");
    vi.mocked(isApproved).mockReturnValue(false);

    expect(await captainActionGate("captain")).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
  });

  it("names the bar in its refusal, or uses the caller's sentence", async () => {
    asActionViewer("member", true);
    expect(await captainActionGate("captain")).toEqual({
      ok: false,
      error: "Captain access only.",
    });
    expect(
      await captainActionGate("captain", "Only captains can publish or send."),
    ).toEqual({ ok: false, error: "Only captains can publish or send." });

    asActionViewer("member", false);
    expect(await captainActionGate("team_lead")).toEqual({
      ok: false,
      error: "Team-lead access only.",
    });
  });

  it("returns the actor and an exact rank when cleared", async () => {
    asActionViewer("member", true);
    expect(await captainActionGate("team_lead")).toMatchObject({
      ok: true,
      rank: "team_lead",
      campUser: { id: "user-1" },
    });

    // Below the captain bar the lead flag is read even when nothing is locked,
    // so a member-level read still knows a lead from a member.
    expect(await captainActionGate("camp_member")).toMatchObject({
      ok: true,
      rank: "team_lead",
    });
  });
});
