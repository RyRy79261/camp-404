import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RosterToolbar } from "./roster-toolbar";

const baseStats = { members: 42, captains: 4, pending: 3, outstanding: 7 };
const baseTeams = [
  { key: "kitchen", label: "Kitchen" },
  { key: "structures", label: "Structures" },
];

function setup(props: Record<string, unknown> = {}) {
  const onChipChange = vi.fn();
  const onTeamChange = vi.fn();
  const onQueryChange = vi.fn();
  render(
    <RosterToolbar
      query=""
      onQueryChange={onQueryChange}
      chip="all"
      onChipChange={onChipChange}
      team={null}
      onTeamChange={onTeamChange}
      teams={baseTeams}
      stats={baseStats}
      {...props}
    />,
  );
  return { onChipChange, onTeamChange, onQueryChange };
}

describe("RosterToolbar — captain view", () => {
  it("shows the status + outstanding chips with counts", () => {
    setup();
    expect(screen.getByRole("button", { name: /All 42/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pending 3/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Captains 4/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Outstanding 7/ })).toBeTruthy();
    expect(screen.getByLabelText("Filter by team")).toBeTruthy();
    expect(screen.getByLabelText("Search the roster")).toBeTruthy();
    // Board S17's copy: a captain can search by email.
    expect(
      screen.getByPlaceholderText("Search by name, handle or email"),
    ).toBeTruthy();
  });

  it("reports chip, team and query changes", () => {
    const { onChipChange, onTeamChange, onQueryChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Captains 4/ }));
    expect(onChipChange).toHaveBeenCalledWith("captains");
    fireEvent.change(screen.getByLabelText("Filter by team"), {
      target: { value: "kitchen" },
    });
    expect(onTeamChange).toHaveBeenCalledWith("kitchen");
    fireEvent.change(screen.getByLabelText("Search the roster"), {
      target: { value: "nova" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("nova");
  });
});

describe("RosterToolbar — member view (publicOnly)", () => {
  const publicStats = { members: 42, captains: 4, pending: 3 };

  it("never offers an email search to a member", () => {
    setup({ publicOnly: true, stats: publicStats });
    expect(
      screen.getByPlaceholderText("Search by name, handle or team"),
    ).toBeTruthy();
  });

  it("offers Pending to a member (owner's ruling) and withholds Outstanding", () => {
    setup({ publicOnly: true, stats: publicStats });
    expect(screen.getByRole("button", { name: /All 42/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Captains 4/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pending 3/ })).toBeTruthy();
    // Outstanding counts blocking required actions — captain-only.
    expect(screen.queryByRole("button", { name: /Outstanding/ })).toBeNull();
    expect(screen.getByLabelText("Filter by team")).toBeTruthy();
    expect(screen.getByLabelText("Search the roster")).toBeTruthy();
  });

  it("reports a Pending press to the member island", () => {
    const { onChipChange } = setup({ publicOnly: true, stats: publicStats });
    fireEvent.click(screen.getByRole("button", { name: /Pending 3/ }));
    expect(onChipChange).toHaveBeenCalledWith("pending");
  });
});
