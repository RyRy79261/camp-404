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
    standing: null,
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

// The same roster with somebody still waiting on a captain's decision.
const withApplicant = [
  ...rows,
  row({ id: "a1", displayName: "Pia Applicant", standing: "pending" }),
];

const teams = [
  { key: "kitchen", label: "Kitchen" },
  { key: "structures", label: "Structures" },
];

describe("MemberRoster — member view", () => {
  it("withholds the captain chrome, but keeps the Pending chip", () => {
    render(<MemberRoster rows={rows} teams={teams} />);
    // The public toolbar is present first — assert what IS there before the
    // absences, so an empty render can't pass this test.
    expect(screen.getByLabelText("Search the roster")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Captains 1/ })).toBeTruthy();
    // Owner's ruling: everyone may see who has applied.
    expect(screen.getByRole("button", { name: /Pending 0/ })).toBeTruthy();
    // No approval stats strip.
    expect(screen.queryByText("Approved")).toBeNull();
    expect(screen.queryByText("Incomplete")).toBeNull();
    // Outstanding counts blocking required actions — still captain-only.
    expect(screen.queryByRole("button", { name: /Outstanding/ })).toBeNull();
  });

  it("counts applicants and filters to them with the Pending chip", () => {
    render(<MemberRoster rows={withApplicant} teams={teams} />);
    expect(screen.getByRole("button", { name: /Pending 1/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Pending 1/ }));
    expect(screen.getAllByText("Pia Applicant").length).toBeGreaterThan(0);
    expect(screen.queryByText("Nova Reyes")).toBeNull();
    expect(screen.queryByText("Ada Cap")).toBeNull();
    // The count and the list agree: one chip, one row.
    expect(screen.getByText("1 member")).toBeTruthy();
  });

  it("draws no standing badge when nobody has applied", () => {
    render(<MemberRoster rows={rows} teams={teams} />);
    expect(screen.queryAllByText("Pending", { selector: "span" })).toEqual([]);
    // …and no Standing column either.
    expect(screen.queryByRole("columnheader", { name: "Standing" })).toBeNull();
  });

  it("marks the applicant, and only the applicant, with a standing badge", () => {
    render(<MemberRoster rows={withApplicant} teams={teams} />);
    expect(screen.getByRole("columnheader", { name: "Standing" })).toBeTruthy();
    // The badge is a <span>; the Pending chip is a <button>, so this counts
    // badges only. Table + card list each draw one, so two per applicant.
    expect(screen.getAllByText("Pending", { selector: "span" }).length).toBe(2);
    // …and none of the captain-only triage vocabulary appears anywhere.
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

  it("filters to captains via the Captains chip", () => {
    render(<MemberRoster rows={rows} teams={teams} />);
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
    render(<MemberRoster rows={[row()]} teams={teams} />);
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

  it("closes an open profile when a filter excludes the selected member", async () => {
    vi.mocked(getPublicMemberProfileAction).mockResolvedValue({
      ok: true,
      bio: "Bio.",
      contribution: null,
    });
    render(<MemberRoster rows={rows} teams={teams} />);
    fireEvent.click(
      screen.getAllByRole("button", { name: /Open Nova Reyes/ })[0]!,
    );
    await waitFor(() =>
      expect(screen.getByText("Captains only.")).toBeTruthy(),
    );
    // Narrow to captains — Nova (a member) drops out, so her panel closes.
    fireEvent.click(screen.getByRole("button", { name: /Captains 1/ }));
    expect(screen.queryByText("Captains only.")).toBeNull();
  });
});
