import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RosterTable } from "./roster-table";
import { toPublicRosterRow, type RosterDisplayRow } from "@/lib/camp-roster";
import type { CampManagementMember } from "@camp404/db/roster";

// A pending, onboarding-incomplete member — every approval signal "on" — so the
// projection→render seam test proves the PUBLIC row still renders none of it.
function pendingMember(): CampManagementMember {
  return {
    id: "m1",
    displayName: "Nova Reyes",
    handle: "nova",
    rank: "member",
    approvalStatus: "pending",
    isLead: false,
    teams: [],
    duesPaid: false,
    membershipTier: null,
    onboardingComplete: false,
    pendingRequiredActions: 3,
    pendingRequiredActionItems: [],
    intendsToDrive: false,
    driverProfileComplete: false,
    country: "ZA",
    createdAt: new Date("2026-01-01"),
  };
}

const memberRow: RosterDisplayRow = {
  id: "m1",
  displayName: "Nova Reyes",
  handle: "nova",
  rankLabel: "Member",
  rank: "member",
  isLead: false,
  teams: [],
  country: "South Africa",
  inSouthAfrica: true,
  standing: null,
  // no `status` → member projection (no captain triage signal)
};

// A member-view row for somebody still waiting on a captain's decision.
const applicantRow: RosterDisplayRow = { ...memberRow, standing: "pending" };

const captainRow: RosterDisplayRow = {
  ...memberRow,
  status: "awaiting_approval",
  statusLabel: "Awaiting approval",
};

describe("RosterTable", () => {
  it("opens a row through a real (keyboard-reachable) button", () => {
    const onSelect = vi.fn();
    render(
      <RosterTable rows={[memberRow]} selectedId={null} onSelect={onSelect} />,
    );
    const open = screen.getByRole("button", {
      name: "Open Nova Reyes's profile",
    });
    expect(open.tagName).toBe("BUTTON");
    fireEvent.click(open);
    expect(onSelect).toHaveBeenCalledWith("m1");
  });

  it("marks the selected row's control with aria-current", () => {
    render(
      <RosterTable rows={[memberRow]} selectedId="m1" onSelect={() => {}} />,
    );
    expect(
      screen
        .getByRole("button", { name: "Open Nova Reyes's profile" })
        .getAttribute("aria-current"),
    ).toBe("true");
  });

  it("shows no approval-status label for a member row", () => {
    render(
      <RosterTable rows={[memberRow]} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.queryByText("Awaiting approval")).toBeNull();
  });

  it("exposes the status label (sr-only) for a captain row", () => {
    render(
      <RosterTable rows={[captainRow]} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByText("Awaiting approval")).toBeTruthy();
  });

  it("renders NO captain triage signal for a row produced by toPublicRosterRow (projection→render seam)", () => {
    render(
      <RosterTable
        rows={[toPublicRosterRow(pendingMember())]}
        selectedId={null}
        onSelect={() => {}}
        showStanding
      />,
    );
    // Present first: the one standing a member may read.
    expect(screen.getByText("Pending")).toBeTruthy();
    // Then the absences — none of the captain's triage vocabulary.
    for (const label of [
      "Awaiting approval",
      "Onboarding",
      "Action needed",
      "Declined",
      "Ready",
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("draws the Standing column only when the island asks for it", () => {
    const { unmount } = render(
      <RosterTable
        rows={[applicantRow]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Member" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Standing" })).toBeNull();
    expect(screen.queryByText("Pending")).toBeNull();
    unmount();

    render(
      <RosterTable
        rows={[applicantRow]}
        selectedId={null}
        onSelect={() => {}}
        showStanding
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Standing" })).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("never draws a standing beside a captain's status column", () => {
    render(
      <RosterTable
        rows={[{ ...captainRow, standing: "pending" }]}
        selectedId={null}
        onSelect={() => {}}
        showStanding
      />,
    );
    // One column, one badge: the captain's, which already says as much.
    expect(screen.getByText("Awaiting approval")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Standing" })).toBeNull();
    expect(screen.queryByText("Pending")).toBeNull();
  });
});

describe("RosterTable — sortable headers", () => {
  it("marks the sorted column and flips direction on a second press", () => {
    const onChange = vi.fn();
    render(
      <RosterTable
        rows={[memberRow]}
        selectedId={null}
        onSelect={() => {}}
        sort={{ value: { key: "name", direction: "asc" }, onChange }}
      />,
    );
    const member = screen.getByRole("columnheader", { name: /Member/ });
    expect(member.getAttribute("aria-sort")).toBe("ascending");
    expect(
      screen
        .getByRole("columnheader", { name: /Country/ })
        .getAttribute("aria-sort"),
    ).toBe("none");

    fireEvent.click(screen.getByRole("button", { name: /Member/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      key: "name",
      direction: "desc",
    });
    fireEvent.click(screen.getByRole("button", { name: /Country/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      key: "country",
      direction: "asc",
    });
  });

  it("renders plain headers for the member roster", () => {
    render(
      <RosterTable rows={[memberRow]} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /^Member/ })).toBeNull();
  });
});
