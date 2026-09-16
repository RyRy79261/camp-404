import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The captain roster island: a just-decided member stays on screen under a
// filter they no longer match, and the Pending filter can decide several
// applicants at once. The profile panel is its own test; here it is a stub that
// reports a decision.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("./actions", () => ({ decideApprovalsAction: vi.fn() }));
vi.mock("./member-profile", () => ({
  MemberProfile: ({
    row,
    onDecided,
  }: {
    row: { id: string; displayName: string };
    onDecided?: (id: string) => void;
  }) => (
    <button type="button" onClick={() => onDecided?.(row.id)}>
      Decide on {row.displayName}
    </button>
  ),
}));

import type { CampManagementMember } from "@camp404/db/roster";
import { toRosterRow } from "@/lib/camp-roster";
import { decideApprovalsAction } from "./actions";
import { CampManagementRoster, bulkSummary } from "./camp-management-roster";

function member(
  id: string,
  displayName: string,
  approvalStatus: CampManagementMember["approvalStatus"],
): CampManagementMember {
  return {
    id,
    displayName,
    handle: null,
    rank: "member",
    approvalStatus,
    isLead: false,
    teams: [],
    duesPaid: false,
    membershipTier: null,
    onboardingComplete: true,
    pendingRequiredActions: 0,
    intendsToDrive: false,
    driverProfileComplete: false,
    country: null,
    createdAt: new Date("2026-01-01"),
    email: null,
  } as CampManagementMember;
}

function rowsOf(...members: CampManagementMember[]) {
  return members.map(toRosterRow);
}

afterEach(() => {
  cleanup();
  vi.mocked(decideApprovalsAction).mockReset();
  refresh.mockReset();
});

function table() {
  // Desktop and mobile both render; the table is enough to read.
  return screen.getByRole("table");
}

describe("CampManagementRoster — a decided member stays on screen", () => {
  it("keeps a just-approved applicant under Pending until the filter changes", () => {
    const pending = rowsOf(member("m1", "Nova", "pending"));
    const { rerender } = render(
      <CampManagementRoster rows={pending} teams={[]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Pending/ }));
    fireEvent.click(within(table()).getByText("Nova"));
    fireEvent.click(screen.getByRole("button", { name: "Decide on Nova" }));

    // The server refresh brings the member back approved.
    rerender(
      <CampManagementRoster
        rows={rowsOf(member("m1", "Nova", "approved"))}
        teams={[]}
      />,
    );
    expect(within(table()).getByText("Nova")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decide on Nova" })).toBeTruthy();

    // A new filter starts afresh.
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Pending/ }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Nobody is awaiting approval.")).toBeTruthy();
  });
});

describe("CampManagementRoster — deciding in bulk", () => {
  it("offers ticks only under Pending, and only on pending rows", () => {
    render(
      <CampManagementRoster
        rows={rowsOf(
          member("m1", "Nova", "pending"),
          member("m2", "Ash", "approved"),
        )}
        teams={[]}
      />,
    );
    expect(
      screen.queryAllByRole("checkbox", { name: /Select Nova/ }),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /^Pending/ }));
    expect(
      within(table()).getByRole("checkbox", { name: "Select Nova" }),
    ).toBeTruthy();
    expect(
      screen.queryAllByRole("checkbox", { name: /Select Ash/ }),
    ).toHaveLength(0);
  });

  it("approves the ticked applicants and says what happened", async () => {
    vi.mocked(decideApprovalsAction).mockResolvedValue({
      ok: true,
      decided: ["m1"],
      lost: ["m2"],
      refused: [],
    });
    render(
      <CampManagementRoster
        rows={rowsOf(
          member("m1", "Nova", "pending"),
          member("m2", "Ash", "pending"),
        )}
        teams={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Pending/ }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select every pending member shown",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve 2" }));

    await waitFor(() =>
      expect(decideApprovalsAction).toHaveBeenCalledWith({
        userIds: ["m1", "m2"],
        to: "approved",
        reason: undefined,
      }),
    );
    expect((await screen.findByRole("status")).textContent).toBe(
      "Approved 1. Ash was already decided by another captain.",
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("asks before a bulk rejection, and sends the one reason", async () => {
    vi.mocked(decideApprovalsAction).mockResolvedValue({
      ok: true,
      decided: ["m1"],
      lost: [],
      refused: [],
    });
    render(
      <CampManagementRoster
        rows={rowsOf(member("m1", "Nova", "pending"))}
        teams={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Pending/ }));
    fireEvent.click(
      within(table()).getByRole("checkbox", { name: "Select Nova" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject 1" }));

    const dialog = await screen.findByRole("dialog");
    expect(decideApprovalsAction).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Reason (optional)"), {
      target: { value: "Full." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject 1" }));

    await waitFor(() =>
      expect(decideApprovalsAction).toHaveBeenCalledWith({
        userIds: ["m1"],
        to: "rejected",
        reason: "Full.",
      }),
    );
  });
});

describe("bulkSummary", () => {
  const nameOf = (id: string) => ({ m1: "Nova", m2: "Ash" })[id] ?? id;

  it("counts the decided, names a lone lost race, and gives each refusal", () => {
    expect(
      bulkSummary(
        "rejected",
        {
          ok: true,
          decided: ["a", "b"],
          lost: ["m2"],
          refused: [
            { userId: "m1", error: "You can't decide on your own account." },
          ],
        },
        nameOf,
      ),
    ).toBe(
      "Rejected 2. Ash was already decided by another captain. Nova: You can't decide on your own account.",
    );
  });

  it("counts several lost races", () => {
    expect(
      bulkSummary(
        "approved",
        { ok: true, decided: [], lost: ["m1", "m2"], refused: [] },
        nameOf,
      ),
    ).toBe("2 were already decided by another captain.");
  });
});
