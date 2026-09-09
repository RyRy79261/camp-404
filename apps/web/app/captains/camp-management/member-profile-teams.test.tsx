import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({
  getMemberDetailAction: vi.fn(),
  decideApprovalAction: vi.fn(),
  assignTeamAction: vi.fn(),
  removeTeamAction: vi.fn(),
  setTeamLeadAction: vi.fn(),
  sendCaptainPromotionAction: vi.fn(),
  cancelCaptainPromotionAction: vi.fn(),
}));

import { MemberProfile } from "./member-profile";
import { getMemberDetailAction, setTeamLeadAction } from "./actions";
import type { RosterRow } from "@/lib/camp-roster";

// The team controls live INSIDE the captain-gated detail load. A viewer the
// action refuses gets the error, not a disabled or empty picker — the refusal
// is the whole render path, so there is nothing on screen to submit.

const row: RosterRow = {
  id: "m1",
  displayName: "Nova Reyes",
  handle: "nova",
  rankLabel: "Member",
  rank: "member",
  isLead: false,
  teams: [],
  country: "South Africa",
  inSouthAfrica: true,
  status: "ready",
  statusLabel: "Ready",
  approvalStatus: "approved",
  awaitingApproval: false,
  onboardingComplete: true,
  pendingRequiredActions: 0,
  requiredComplete: true,
  isDriver: false,
  driverProfileComplete: false,
};

function loaded(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    member: {
      id: "m1",
      displayName: "Nova Reyes",
      approvalStatus: "approved" as const,
      approvalSummary: "Approved.",
      bio: null,
      overview: [],
      profileSections: [],
    },
    canAssignCaptain: false,
    promotionStep: { sent: false, accepted: false },
    promotionRequestId: null,
    promotionRequestIsMine: false,
    teams: [],
    assignableTeams: [{ key: "kitchen", label: "Kitchen" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MemberProfile — team assignment", () => {
  it("renders NOTHING assignable when the captain gate refuses the viewer", async () => {
    vi.mocked(getMemberDetailAction).mockResolvedValue({
      ok: false,
      error: "Captain access only.",
    });

    render(<MemberProfile row={row} index={1} onClose={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText("Captain access only.")).toBeTruthy(),
    );
    expect(screen.queryByText("Teams")).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("shows the picker for a captain, seeded from the server's lists", async () => {
    vi.mocked(getMemberDetailAction).mockResolvedValue(
      loaded({
        teams: [{ team: "kitchen", isLead: true, cycle: 2027 }],
      }) as never,
    );

    render(<MemberProfile row={row} index={1} onClose={() => {}} />);

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Kitchen" })).toBeTruthy(),
    );
    expect(
      (screen.getByRole("switch") as HTMLElement).dataset.state,
    ).toBe("checked");
  });

  it("offers no lead switch until the member is actually on the team", async () => {
    vi.mocked(getMemberDetailAction).mockResolvedValue(loaded() as never);

    render(<MemberProfile row={row} index={1} onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Kitchen" })).toBeTruthy(),
    );
    // The lead flag is a modifier on a membership, never a way to create one —
    // so there is no control to submit one from.
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("promotes to lead through the panel and reflects the result", async () => {
    vi.mocked(getMemberDetailAction).mockResolvedValue(
      loaded({
        teams: [{ team: "kitchen", isLead: false, cycle: 2027 }],
      }) as never,
    );
    vi.mocked(setTeamLeadAction).mockResolvedValue({
      ok: true,
      teams: [{ team: "kitchen", isLead: true, cycle: 2027 }],
    });

    render(<MemberProfile row={row} index={1} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole("switch")).toBeTruthy());

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() =>
      expect(setTeamLeadAction).toHaveBeenCalledWith("m1", "kitchen", true),
    );
    await waitFor(() =>
      expect((screen.getByRole("switch") as HTMLElement).dataset.state).toBe(
        "checked",
      ),
    );
  });
});
