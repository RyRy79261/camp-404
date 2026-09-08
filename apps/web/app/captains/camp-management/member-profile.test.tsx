import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("./actions", () => ({
  getMemberDetailAction: vi.fn(),
  decideApprovalAction: vi.fn(),
  // Imported at module scope by AssignCaptainDialog.
  sendCaptainPromotionAction: vi.fn(),
  cancelCaptainPromotionAction: vi.fn(),
}));

import { MemberProfile } from "./member-profile";
import {
  decideApprovalAction,
  getMemberDetailAction,
  type MemberDetailResult,
} from "./actions";
import type { RosterRow } from "@/lib/camp-roster";
import type { PresentedMember } from "@/lib/member-detail";

const LOST_CAS = "Another captain already decided on this member.";

function row(over: Partial<RosterRow> = {}): RosterRow {
  return {
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
    approvalStatus: "pending",
    awaitingApproval: true,
    onboardingComplete: true,
    pendingRequiredActions: 0,
    requiredComplete: true,
    isDriver: false,
    driverProfileComplete: false,
    ...over,
  };
}

function detail(
  approvalStatus: PresentedMember["approvalStatus"],
): MemberDetailResult {
  return {
    ok: true,
    member: {
      id: "m1",
      displayName: "Nova Reyes",
      rankLabel: "Member",
      approvalStatus,
      approvalSummary: `Decision: ${approvalStatus}`,
      bio: null,
      profileImageUrl: null,
      overview: [],
      profileSections: [],
    },
    canAssignCaptain: false,
    promotionStep: { sent: false, accepted: false },
    promotionRequestId: null,
    promotionRequestIsMine: false,
  };
}

function renderProfile(over: Partial<RosterRow> = {}) {
  const onClose = vi.fn();
  render(<MemberProfile row={row(over)} index={1} onClose={onClose} />);
  return { onClose };
}

afterEach(() => {
  cleanup();
  vi.mocked(getMemberDetailAction).mockReset();
  vi.mocked(decideApprovalAction).mockReset();
  refresh.mockReset();
});

describe("MemberProfile — a decision that lost the race", () => {
  it("reloads the detail so the refused decision stops being offered", async () => {
    // The panel is opened on a member this captain still sees as pending, but
    // another captain approved them in between. The compare-and-set refuses,
    // and the standing status has to come back down — `router.refresh()` alone
    // re-renders the roster behind the panel and leaves `detail` as it was.
    vi.mocked(getMemberDetailAction)
      .mockResolvedValueOnce(detail("pending"))
      .mockResolvedValueOnce(detail("approved"));
    vi.mocked(decideApprovalAction).mockResolvedValue({
      ok: false,
      error: LOST_CAS,
    });

    renderProfile();
    const approve = await screen.findByRole("button", { name: /Approve/ });
    fireEvent.click(approve);

    // Wait for the SETTLED panel, not for the buttons to go: the reload blanks
    // to `loading` synchronously (which already removes them) and only paints
    // the standing decision once the refetch resolves. Asserting in between is
    // the flake.
    await waitFor(() => expect(screen.getByText("Approved")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    // The standing decision is shown, not the stale "pending".
    expect(screen.getByText("Decision: approved")).toBeTruthy();
    // The refusal survives the reload — it is why the buttons went.
    expect(screen.getByRole("alert").textContent).toBe(LOST_CAS);

    expect(getMemberDetailAction).toHaveBeenCalledTimes(2);
    expect(getMemberDetailAction).toHaveBeenLastCalledWith("m1");
    expect(refresh).toHaveBeenCalled();
  });

  it("closes the reject confirmation the refused decision came from", async () => {
    vi.mocked(getMemberDetailAction)
      .mockResolvedValueOnce(detail("pending"))
      .mockResolvedValueOnce(detail("rejected"));
    vi.mocked(decideApprovalAction).mockResolvedValue({
      ok: false,
      error: LOST_CAS,
    });

    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    // The dialog's own Reject is the confirm step.
    const confirm = await screen.findByRole("dialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Reject" }));

    // Same ordering as above — the dialog closes a render before the refetch
    // resolves, so the settled text is what says the reload is done.
    await waitFor(() => expect(screen.getByText("Rejected")).toBeTruthy());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  });

  it("does not refetch when the decision is accepted", async () => {
    vi.mocked(getMemberDetailAction).mockResolvedValue(detail("pending"));
    vi.mocked(decideApprovalAction).mockResolvedValue({ ok: true });

    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: /Approve/ }));

    // The accepted path already knows the new status, so it applies it locally
    // and leaves the fetch alone.
    await waitFor(() => expect(screen.getByText("Approved")).toBeTruthy());
    expect(getMemberDetailAction).toHaveBeenCalledTimes(1);
  });
});
