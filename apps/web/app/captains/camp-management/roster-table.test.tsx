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
  // no `status` → member projection (no approval signal)
};

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

  it("renders NO approval signal for a row produced by toPublicRosterRow (projection→render seam)", () => {
    render(
      <RosterTable
        rows={[toPublicRosterRow(pendingMember())]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    for (const label of [
      "Awaiting approval",
      "Onboarding",
      "Action needed",
      "Rejected",
      "Ready",
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });
});
