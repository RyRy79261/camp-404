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
    pendingRequiredActionItems: [],
    intendsToDrive: false,
    driverProfileComplete: false,
    country: null,
    participation: null,
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
        // In roster order: sorted by name, Ash before Nova.
        userIds: ["m2", "m1"],
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

describe("CampManagementRoster — the ?team= deep link", () => {
  const TEAMS = [
    { key: "kitchen", label: "Kitchen" },
    { key: "structures", label: "Structures" },
  ];

  function onTeams(
    id: string,
    name: string,
    teams: string[],
    approvalStatus: CampManagementMember["approvalStatus"] = "approved",
  ) {
    return {
      ...member(id, name, approvalStatus),
      teams,
    } as CampManagementMember;
  }

  const ROWS = rowsOf(
    onTeams("m1", "Nova", ["kitchen"]),
    onTeams("m2", "Ash", ["structures"]),
  );

  function teamSelect() {
    return screen.getByLabelText("Filter by team") as HTMLSelectElement;
  }

  it("opens filtered to the team the URL named", () => {
    render(
      <CampManagementRoster rows={ROWS} teams={TEAMS} initialTeam="kitchen" />,
    );

    expect(teamSelect().value).toBe("kitchen");
    expect(within(table()).getByText("Nova")).toBeTruthy();
    expect(within(table()).queryByText("Ash")).toBeNull();
  });

  it("follows a ?team= that changes without leaving the route", () => {
    // Browser Back/Forward between two `?team=` URLs of this route re-renders
    // the server component but keeps this island mounted. Seeding useState once
    // would leave the list showing Kitchen while the address bar said
    // Structures — the roster would be lying about what it is showing.
    const { rerender } = render(
      <CampManagementRoster rows={ROWS} teams={TEAMS} initialTeam="kitchen" />,
    );
    expect(within(table()).queryByText("Ash")).toBeNull();

    rerender(
      <CampManagementRoster
        rows={ROWS}
        teams={TEAMS}
        initialTeam="structures"
      />,
    );

    expect(teamSelect().value).toBe("structures");
    expect(within(table()).getByText("Ash")).toBeTruthy();
    expect(within(table()).queryByText("Nova")).toBeNull();
  });

  it("clears the filter when the URL drops ?team= entirely", () => {
    const { rerender } = render(
      <CampManagementRoster rows={ROWS} teams={TEAMS} initialTeam="kitchen" />,
    );

    rerender(
      <CampManagementRoster rows={ROWS} teams={TEAMS} initialTeam={null} />,
    );

    expect(teamSelect().value).toBe("");
    expect(within(table()).getByText("Nova")).toBeTruthy();
    expect(within(table()).getByText("Ash")).toBeTruthy();
  });

  it("does not carry a member pinned under one team into the next team's list", () => {
    // A pinned row is rendered THROUGH the team filter, so a member kept on
    // screen by a decision under Kitchen would otherwise still be listed after
    // the rail's link swapped the filter to Structures — reading as if they
    // were on Structures.
    const pending = rowsOf(
      onTeams("m1", "Nova", ["kitchen"], "pending"),
      onTeams("m2", "Ash", ["structures"]),
    );

    const { rerender } = render(
      <CampManagementRoster
        rows={pending}
        teams={TEAMS}
        initialTeam="kitchen"
      />,
    );
    fireEvent.click(within(table()).getByText("Nova"));
    fireEvent.click(screen.getByRole("button", { name: "Decide on Nova" }));
    expect(within(table()).getByText("Nova")).toBeTruthy();

    rerender(
      <CampManagementRoster
        rows={pending}
        teams={TEAMS}
        initialTeam="structures"
      />,
    );

    expect(within(table()).queryByText("Nova")).toBeNull();
    expect(within(table()).getByText("Ash")).toBeTruthy();
  });

  it("leaves a filter the captain chose alone while the URL stays put", () => {
    const { rerender } = render(
      <CampManagementRoster rows={ROWS} teams={TEAMS} initialTeam={null} />,
    );

    fireEvent.change(teamSelect(), { target: { value: "structures" } });
    expect(within(table()).queryByText("Nova")).toBeNull();

    // A re-render for any other reason must not snap the filter back to the URL.
    rerender(
      <CampManagementRoster rows={ROWS} teams={TEAMS} initialTeam={null} />,
    );

    expect(teamSelect().value).toBe("structures");
    expect(within(table()).queryByText("Nova")).toBeNull();
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
