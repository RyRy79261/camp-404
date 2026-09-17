import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Which tool cards each rank gets. A team lead gets the Questionnaires card
// (owner's call, 2026-09-16) and a lock for the rest; a member gets only the
// lock. The gate itself is lib/captain-gate's own test.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));

import { captainPageGate } from "@/lib/captain-gate";
import CaptainToolsPage from "./page";

afterEach(cleanup);

async function renderAs(rank: "captain" | "team_lead" | "camp_member") {
  vi.mocked(captainPageGate).mockResolvedValue({
    rank,
    cleared: rank !== "camp_member",
  } as never);
  render(await CaptainToolsPage());
}

describe("captain tools hub", () => {
  it("gives a captain every tool and no lock", async () => {
    await renderAs("captain");
    expect(screen.getAllByRole("link", { name: /./ }).length).toBeGreaterThan(
      5,
    );
    expect(screen.queryByText("Captain access only")).toBeNull();
  });

  it("gives a team lead the Questionnaires card and locks the rest", async () => {
    await renderAs("team_lead");
    expect(
      screen.getByRole("link", { name: /Questionnaires/ }).getAttribute("href"),
    ).toBe("/captains/questionnaires");
    expect(
      screen.queryByRole("link", { name: /Roster & approvals/ }),
    ).toBeNull();
    expect(
      screen.getByText("The other camp tools are captain-only."),
    ).toBeTruthy();
  });

  it("gives a member no tools", async () => {
    await renderAs("camp_member");
    expect(screen.queryByRole("link", { name: /Questionnaires/ })).toBeNull();
    expect(screen.getByText(/this tooling is captain-only/i)).toBeTruthy();
  });
});
