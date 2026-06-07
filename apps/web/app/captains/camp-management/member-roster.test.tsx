import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("./actions", () => ({
  getPublicMemberProfileAction: vi.fn(),
  // Spied to assert the member path NEVER touches the captain decrypt action.
  getMemberDetailAction: vi.fn(),
}));

import { MemberRoster } from "./member-roster";
import { getMemberDetailAction, getPublicMemberProfileAction } from "./actions";
import type { PublicRosterRow } from "@/lib/camp-roster";

function row(over: Partial<PublicRosterRow> = {}): PublicRosterRow {
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
    ...over,
  };
}

const rows = [
  row({ id: "m1", displayName: "Nova Reyes", rank: "member" }),
  row({
    id: "c1",
    displayName: "Ada Cap",
    rank: "captain",
    rankLabel: "Captain",
    handle: "ada",
  }),
];

describe("MemberRoster — member view", () => {
  it("withholds all captain chrome (stats strip + approval chips)", () => {
    render(<MemberRoster rows={rows} />);
    // No approval stats strip.
    expect(screen.queryByText("Approved")).toBeNull();
    expect(screen.queryByText("Incomplete")).toBeNull();
    // No approval-derived chips.
    expect(screen.queryByRole("button", { name: /Pending/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Outstanding/ })).toBeNull();
    // The public toolbar is present.
    expect(screen.getByLabelText("Search the roster")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Captains 1/ })).toBeTruthy();
  });

  it("filters to captains via the Captains chip", () => {
    render(<MemberRoster rows={rows} />);
    expect(screen.getAllByText("Nova Reyes").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Captains 1/ }));
    expect(screen.queryByText("Nova Reyes")).toBeNull();
    expect(screen.getAllByText("Ada Cap").length).toBeGreaterThan(0);
  });

  it("opens a public profile card on row open", async () => {
    vi.mocked(getPublicMemberProfileAction).mockResolvedValue({
      ok: true,
      bio: "Bio text.",
      contribution: null,
    });
    render(<MemberRoster rows={[row()]} />);
    // Two open controls render (table + list); click the first.
    fireEvent.click(
      screen.getAllByRole("button", { name: /Open Nova Reyes/ })[0]!,
    );
    await waitFor(() =>
      expect(screen.getByText("Captains only.")).toBeTruthy(),
    );
    expect(getPublicMemberProfileAction).toHaveBeenCalledWith("m1");
    // The member path must never reach the captain decrypt-everything action.
    expect(getMemberDetailAction).not.toHaveBeenCalled();
  });
});
