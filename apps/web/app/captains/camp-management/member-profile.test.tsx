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
import { availableReviewActions, type ReviewOption } from "@camp404/core";
import type { RosterRow } from "@/lib/camp-roster";
import type { PresentedMember } from "@/lib/member-detail";

const LOST_CAS = "Another captain already changed this member's decision.";

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
    email: null,
    status: "ready",
    statusLabel: "Ready",
    approvalStatus: "pending",
    awaitingApproval: true,
    onboardingComplete: true,
    pendingRequiredActions: 0,
    requiredComplete: true,
    isDriver: false,
    driverProfileComplete: false,
    duesPaid: false,
    ...over,
  };
}

function detail(
  approvalStatus: PresentedMember["approvalStatus"],
  reviewOptions: ReviewOption[] = availableReviewActions({
    status: approvalStatus,
    isSelf: false,
    isCaptain: false,
  }),
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
    promotionRequestedByName: null,
    // Wave 2 added the team panel to this action's payload; the decision-race
    // cases below do not exercise it, but the panel renders from these and an
    // absent array is a crash, not an empty list.
    teams: [],
    assignableTeams: [],
    reviewOptions,
    notes: [],
    questionnaires: [],
  };
}

function renderProfile(over: Partial<RosterRow> = {}) {
  const onClose = vi.fn();
  const onDecided = vi.fn();
  render(
    <MemberProfile
      row={row(over)}
      index={1}
      onClose={onClose}
      onDecided={onDecided}
    />,
  );
  return { onClose, onDecided };
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
    // The standing rejection offers its own next steps, not a second reject.
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("sends the reason typed in the reject confirmation", async () => {
    vi.mocked(getMemberDetailAction).mockResolvedValue(detail("pending"));
    vi.mocked(decideApprovalAction).mockResolvedValue({ ok: true });

    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const confirm = await screen.findByRole("dialog");
    fireEvent.change(within(confirm).getByLabelText(/Reason for/), {
      target: { value: "We are full this year." },
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(decideApprovalAction).toHaveBeenCalledWith({
        userId: "m1",
        from: "pending",
        to: "rejected",
        reason: "We are full this year.",
      }),
    );
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

describe("MemberProfile — the decision panel", () => {
  it("offers to remove an approved member or move them back to pending", async () => {
    vi.mocked(getMemberDetailAction).mockResolvedValue(detail("approved"));
    vi.mocked(decideApprovalAction).mockResolvedValue({ ok: true });

    const { onDecided } = renderProfile({ approvalStatus: "approved" });
    fireEvent.click(
      await screen.findByRole("button", { name: /Remove from camp/ }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Remove Nova Reyes from camp?"),
    ).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove from camp" }),
    );

    await waitFor(() =>
      expect(decideApprovalAction).toHaveBeenCalledWith({
        userId: "m1",
        from: "approved",
        to: "rejected",
        reason: "",
      }),
    );
    // The roster is told, so the member stays on screen under its filter.
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith("m1"));
    // And the panel now offers what follows a rejection.
    expect(await screen.findByRole("button", { name: /Approve/ })).toBeTruthy();
  });

  it("asks before moving a decision back to pending", async () => {
    vi.mocked(getMemberDetailAction).mockResolvedValue(detail("rejected"));
    vi.mocked(decideApprovalAction).mockResolvedValue({ ok: true });

    renderProfile({ approvalStatus: "rejected" });
    fireEvent.click(
      await screen.findByRole("button", { name: /Move back to pending/ }),
    );
    await screen.findByText("Move Nova Reyes back to pending?");
    expect(decideApprovalAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Move to pending" }));
    await waitFor(() =>
      expect(decideApprovalAction).toHaveBeenCalledWith({
        userId: "m1",
        from: "rejected",
        to: "pending",
        reason: undefined,
      }),
    );
  });

  it("shows a refused decision disabled, with the server's sentence", async () => {
    vi.mocked(getMemberDetailAction).mockResolvedValue(
      detail(
        "approved",
        availableReviewActions({
          status: "approved",
          isSelf: false,
          isCaptain: true,
        }),
      ),
    );

    renderProfile({ approvalStatus: "approved", rank: "captain" });
    const remove = await screen.findByRole("button", {
      name: /Remove from camp/,
    });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: /Move back to pending/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    // Both are refused for the same reason, so it is said once.
    expect(
      screen.getAllByText("A captain can't be taken out of camp here."),
    ).toHaveLength(1);
  });
});
