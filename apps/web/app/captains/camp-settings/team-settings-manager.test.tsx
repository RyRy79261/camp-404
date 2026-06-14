import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("./actions", () => ({
  renameTeamAction: vi.fn(),
  moveTeamAction: vi.fn(),
  setTeamArchivedAction: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { TeamSettingsManager } from "./team-settings-manager";
import {
  moveTeamAction,
  renameTeamAction,
  setTeamArchivedAction,
} from "./actions";

const teams = [
  { key: "kitchen", label: "Kitchen", order: 0, archived: false },
  { key: "structures", label: "Structures", order: 1, archived: false },
  { key: "art_and_activities", label: "Art", order: 2, archived: true },
];

function ok() {
  return Promise.resolve({ ok: true as const });
}

describe("TeamSettingsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders every team and flags the archived one", () => {
    render(<TeamSettingsManager teams={teams} />);
    expect(screen.getByText("Kitchen")).toBeTruthy();
    expect(screen.getByText("Structures")).toBeTruthy();
    expect(screen.getByText("Art")).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy(); // the Art badge
  });

  it("disables reorder at the edges", () => {
    render(<TeamSettingsManager teams={teams} />);
    expect(
      screen.getByRole("button", { name: "Move Kitchen up" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Move Art down" }),
    ).toHaveProperty("disabled", true);
    // Interior moves are enabled.
    expect(
      screen.getByRole("button", { name: "Move Kitchen down" }),
    ).toHaveProperty("disabled", false);
  });

  it("reorders via the move action", async () => {
    vi.mocked(moveTeamAction).mockImplementation(ok);
    render(<TeamSettingsManager teams={teams} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Kitchen down" }));
    await waitFor(() =>
      expect(moveTeamAction).toHaveBeenCalledWith("kitchen", "down"),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("archives an active team via the switch (active → off)", async () => {
    vi.mocked(setTeamArchivedAction).mockImplementation(ok);
    render(<TeamSettingsManager teams={teams} />);
    fireEvent.click(screen.getByRole("switch", { name: "Kitchen active" }));
    await waitFor(() =>
      expect(setTeamArchivedAction).toHaveBeenCalledWith("kitchen", true),
    );
  });

  it("renames a team with the trimmed draft", async () => {
    vi.mocked(renameTeamAction).mockImplementation(ok);
    render(<TeamSettingsManager teams={teams} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Kitchen" }));
    const input = screen.getByLabelText("Rename Kitchen");
    fireEvent.change(input, { target: { value: "  Cuisine  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save name for Kitchen" }));
    await waitFor(() =>
      expect(renameTeamAction).toHaveBeenCalledWith("kitchen", "Cuisine"),
    );
  });

  it("keeps edit mode with a hint when the rename is emptied", async () => {
    render(<TeamSettingsManager teams={teams} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Kitchen" }));
    const input = screen.getByLabelText("Rename Kitchen");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByText("A team needs a name.")).toBeTruthy(),
    );
    // Still in edit mode (the input is present), and no write was attempted.
    expect(screen.getByLabelText("Rename Kitchen")).toBeTruthy();
    expect(renameTeamAction).not.toHaveBeenCalled();
  });

  it("surfaces a server-action error", async () => {
    vi.mocked(moveTeamAction).mockResolvedValue({
      ok: false,
      error: "Captain access only.",
    });
    render(<TeamSettingsManager teams={teams} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Kitchen down" }));
    await waitFor(() =>
      expect(screen.getByText("Captain access only.")).toBeTruthy(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
