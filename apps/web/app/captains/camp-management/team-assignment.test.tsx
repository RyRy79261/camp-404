import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("./actions", () => ({
  assignTeamAction: vi.fn(),
  removeTeamAction: vi.fn(),
  setTeamLeadAction: vi.fn(),
}));

import { TeamAssignment } from "./team-assignment";
import {
  assignTeamAction,
  removeTeamAction,
  setTeamLeadAction,
} from "./actions";

const ASSIGNABLE = [
  { key: "kitchen", label: "Kitchen" },
  { key: "structures", label: "Structures" },
];

function renderControl(props: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  render(
    <TeamAssignment
      userId="member-1"
      teams={[]}
      assignableTeams={ASSIGNABLE}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeamAssignment", () => {
  it("offers only the active teams, with membership state from the server", () => {
    renderControl({
      teams: [{ team: "kitchen", isLead: false, cycle: 2027 }],
    });

    expect(
      (screen.getByRole("checkbox", { name: "Kitchen" }) as HTMLElement)
        .dataset.state,
    ).toBe("checked");
    expect(
      (screen.getByRole("checkbox", { name: "Structures" }) as HTMLElement)
        .dataset.state,
    ).toBe("unchecked");
    // The lead switch belongs to the membership, so it exists only where there
    // is one to modify.
    expect(screen.getAllByRole("switch")).toHaveLength(1);
  });

  it("never offers an archived team, but lets a captain remove one", async () => {
    // `ministry_of_memes` is a membership with no matching ACTIVE team — the
    // team was archived after this member joined it.
    vi.mocked(removeTeamAction).mockResolvedValue({ ok: true, teams: [] });
    const { onChange } = renderControl({
      teams: [{ team: "ministry_of_memes", isLead: false, cycle: 2027 }],
      teamLabels: { ministry_of_memes: "Ministry of Memes" },
    });

    // Not pickable…
    expect(
      screen.queryByRole("checkbox", { name: "Ministry of Memes" }),
    ).toBeNull();
    // …but visible and removable, so archiving a team can't strand its roster.
    expect(screen.getByText("Ministry of Memes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(removeTeamAction).toHaveBeenCalledWith(
        "member-1",
        "ministry_of_memes",
      ),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
  });

  it("assigns a team and re-renders from the server's membership list", async () => {
    const teams = [{ team: "kitchen" as const, isLead: false, cycle: 2027 }];
    vi.mocked(assignTeamAction).mockResolvedValue({ ok: true, teams });
    const { onChange } = renderControl();

    fireEvent.click(screen.getByRole("checkbox", { name: "Kitchen" }));

    await waitFor(() =>
      expect(assignTeamAction).toHaveBeenCalledWith("member-1", "kitchen"),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(teams));
  });

  it("un-ticking a team removes the membership", async () => {
    vi.mocked(removeTeamAction).mockResolvedValue({ ok: true, teams: [] });
    renderControl({ teams: [{ team: "kitchen", isLead: false, cycle: 2027 }] });

    fireEvent.click(screen.getByRole("checkbox", { name: "Kitchen" }));

    await waitFor(() =>
      expect(removeTeamAction).toHaveBeenCalledWith("member-1", "kitchen"),
    );
    expect(assignTeamAction).not.toHaveBeenCalled();
  });

  it("marks a member as the team's lead", async () => {
    const teams = [{ team: "kitchen" as const, isLead: true, cycle: 2027 }];
    vi.mocked(setTeamLeadAction).mockResolvedValue({ ok: true, teams });
    const { onChange } = renderControl({
      teams: [{ team: "kitchen", isLead: false, cycle: 2027 }],
    });

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() =>
      expect(setTeamLeadAction).toHaveBeenCalledWith(
        "member-1",
        "kitchen",
        true,
      ),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(teams));
  });

  it("stands a lead down again — removing the last lead is allowed", async () => {
    const teams = [{ team: "kitchen" as const, isLead: false, cycle: 2027 }];
    vi.mocked(setTeamLeadAction).mockResolvedValue({ ok: true, teams });
    renderControl({ teams: [{ team: "kitchen", isLead: true, cycle: 2027 }] });

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() =>
      expect(setTeamLeadAction).toHaveBeenCalledWith(
        "member-1",
        "kitchen",
        false,
      ),
    );
  });

  it("surfaces a refused write inline and does not touch the membership list", async () => {
    vi.mocked(assignTeamAction).mockResolvedValue({
      ok: false,
      error: "Captain access only.",
    });
    const { onChange } = renderControl();

    fireEvent.click(screen.getByRole("checkbox", { name: "Kitchen" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /Captain access only/,
      ),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says so when the camp has no active teams", () => {
    renderControl({ assignableTeams: [] });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText(/No active teams to assign/)).toBeTruthy();
  });
});
