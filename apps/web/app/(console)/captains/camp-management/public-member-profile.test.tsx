import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("./actions", () => ({
  getPublicMemberProfileAction: vi.fn(),
  // Spied to assert the public card NEVER calls the captain decrypt action.
  getMemberDetailAction: vi.fn(),
}));

import { PublicMemberProfile } from "./public-member-profile";
import { getMemberDetailAction, getPublicMemberProfileAction } from "./actions";
import type { PublicRosterRow } from "@/lib/camp-roster";

const row: PublicRosterRow = {
  id: "m1",
  displayName: "Nova Reyes",
  handle: "nova",
  rankLabel: "Member",
  rank: "member",
  isLead: false,
  teams: ["kitchen"],
  country: "South Africa",
  inSouthAfrica: true,
};

describe("PublicMemberProfile", () => {
  it("shows public identity + a Captains-only lock and loads the allowlisted body", async () => {
    vi.mocked(getPublicMemberProfileAction).mockResolvedValue({
      ok: true,
      bio: "Runs a darkroom.",
      contribution: "Analog photo lab.",
    });
    render(<PublicMemberProfile row={row} index={1} onClose={() => {}} />);

    // Identity comes from the public row.
    expect(screen.getByRole("heading", { name: "Nova Reyes" })).toBeTruthy();
    expect(screen.getByText("@nova")).toBeTruthy();
    // The captain-only section is locked, not shown.
    expect(screen.getByText("Captains only.")).toBeTruthy();
    // Allowlisted body loads.
    await waitFor(() =>
      expect(screen.getByText("Runs a darkroom.")).toBeTruthy(),
    );
    expect(screen.getByText("Analog photo lab.")).toBeTruthy();
    // No admin actions for a member.
    expect(
      screen.queryByRole("button", { name: /Approve|Reject|Assign/ }),
    ).toBeNull();
    expect(getPublicMemberProfileAction).toHaveBeenCalledWith("m1");
    // The public card must never reach the captain decrypt-everything action.
    expect(getMemberDetailAction).not.toHaveBeenCalled();
  });

  it("surfaces a load error without exposing data", async () => {
    vi.mocked(getPublicMemberProfileAction).mockResolvedValue({
      ok: false,
      error: "Member not found.",
    });
    render(<PublicMemberProfile row={row} index={2} onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Member not found.")).toBeTruthy(),
    );
  });
});
