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

import { toast } from "@camp404/ui/components/toast";
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

// Three active teams, so one can be archived without breaching the minimum.
const roomyTeams = [
  ...teams.slice(0, 2),
  { key: "ministry_of_vibes", label: "Vibes", order: 2, archived: false },
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
    render(<TeamSettingsManager teams={roomyTeams} />);
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
    fireEvent.click(
      screen.getByRole("button", { name: "Save name for Kitchen" }),
    );
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

  it("reports a failed move as a toast", async () => {
    vi.mocked(moveTeamAction).mockResolvedValue({
      ok: false,
      error: "Captain access only.",
    });
    render(<TeamSettingsManager teams={teams} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Kitchen down" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Captain access only."),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says a move worked", async () => {
    vi.mocked(moveTeamAction).mockImplementation(ok);
    render(<TeamSettingsManager teams={teams} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Kitchen down" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Kitchen moved down"),
    );
  });

  it("shows a rename the server refuses on the name field", async () => {
    vi.mocked(renameTeamAction).mockResolvedValue({
      ok: false,
      error: "Another team is already called Structures.",
    });
    render(<TeamSettingsManager teams={teams} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Kitchen" }));
    const input = screen.getByLabelText("Rename Kitchen");
    fireEvent.change(input, { target: { value: "Structures" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(input.getAttribute("aria-invalid")).toBe("true"),
    );
    expect(
      screen.getByText("Another team is already called Structures."),
    ).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("returns focus to Rename when the rename is cancelled", async () => {
    render(<TeamSettingsManager teams={teams} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Kitchen" }));
    fireEvent.keyDown(screen.getByLabelText("Rename Kitchen"), {
      key: "Escape",
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Rename Kitchen" }),
      ),
    );
  });

  it("keeps focus on the row after a move, even at the end of the list", async () => {
    let land!: (result: { ok: true }) => void;
    vi.mocked(moveTeamAction).mockReturnValue(
      new Promise((resolve) => {
        land = resolve;
      }),
    );
    const { rerender } = render(<TeamSettingsManager teams={teams} />);
    const down = screen.getByRole("button", { name: "Move Structures down" });
    down.focus();
    fireEvent.click(down);
    // The new order arrives while the change still runs. Structures is last,
    // so its down button is disabled and focus goes to its up button.
    rerender(<TeamSettingsManager teams={[teams[0]!, teams[2]!, teams[1]!]} />);
    land({ ok: true });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Move Structures up" }),
      ),
    );
  });

  it("will not archive below two active teams, and says why", () => {
    render(<TeamSettingsManager teams={teams} />);
    const kitchen = screen.getByRole("switch", { name: "Kitchen active" });
    expect(kitchen).toHaveProperty("disabled", true);
    const reason = document.getElementById(
      kitchen.getAttribute("aria-describedby") ?? "",
    );
    expect(reason?.textContent).toMatch(/at least\s+2/);
    // An archived team can always be restored.
    expect(screen.getByRole("switch", { name: "Art active" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("allows archiving while more than two teams are active", () => {
    render(<TeamSettingsManager teams={roomyTeams} />);
    expect(
      screen.getByRole("switch", { name: "Kitchen active" }),
    ).toHaveProperty("disabled", false);
    expect(document.getElementById("team-minimum-active")).toBeNull();
  });

  it("shows an empty state when the camp has no teams", () => {
    render(<TeamSettingsManager teams={[]} />);
    expect(screen.getByText("No teams yet.")).toBeTruthy();
  });
});
