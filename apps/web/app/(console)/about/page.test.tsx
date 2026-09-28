import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_JOIN_CONTENT } from "@camp404/types";

// About Camp 404 (#264): every approved member reads the camp's intro; only a
// captain is offered the way to edit it (the Join site program, whose own
// gate refuses anyone else). The spend list's amounts are last year's budget,
// so they are not shown as this year's.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/about", () => ({ getAboutCamp: vi.fn() }));

import { captainPageGate } from "@/lib/captain-gate";
import { getAboutCamp } from "@/lib/about";
import AboutPage from "./page";

const ABOUT = {
  year: 2027,
  yearName: null,
  burn: { start: "2027-04-26", end: "2027-05-02" },
  content: DEFAULT_JOIN_CONTENT,
  teams: [
    { key: "kitchen", label: "Kitchen", description: "Menu and recipes." },
  ],
  captains: [{ name: "Caitlin", title: "Chief Cat Herder", blurb: "" }],
};

function asRank(rank: "camp_member" | "team_lead" | "captain") {
  vi.mocked(captainPageGate).mockResolvedValue({
    cleared: true,
    rank,
    campUser: { id: "u1" },
  } as unknown as Awaited<ReturnType<typeof captainPageGate>>);
}

beforeEach(() => {
  vi.mocked(getAboutCamp).mockResolvedValue(ABOUT);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("About Camp 404", () => {
  it("reads the camp's intro to a plain member, with no way to edit it", async () => {
    asRank("camp_member");
    render(await AboutPage());
    expect(
      screen.getByRole("heading", { level: 1, name: "About Camp 404" }),
    ).toBeTruthy();
    expect(screen.getByText(DEFAULT_JOIN_CONTENT.readme.warning)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Edit these words/ })).toBeNull();
    expect(captainPageGate).toHaveBeenCalledWith("camp_member");
  });

  it("offers a team lead no way to edit it either", async () => {
    asRank("team_lead");
    render(await AboutPage());
    expect(screen.queryByRole("link", { name: /Edit these words/ })).toBeNull();
  });

  it("sends a captain to the Join site program to edit it", async () => {
    asRank("captain");
    render(await AboutPage());
    expect(
      screen
        .getByRole("link", { name: /Edit these words/ })
        .getAttribute("href"),
    ).toBe("/captains/join-site");
  });

  it("links each team to its page and names the Burn's dates", async () => {
    asRank("camp_member");
    render(await AboutPage());
    const teams = screen.getByRole("list", { name: "Teams" });
    expect(
      within(teams).getByRole("link", { name: "Kitchen" }).getAttribute("href"),
    ).toBe("/teams/kitchen");
    expect(
      screen.getByText(/The 2027 Burn: 26 April – 2 May 2027\./),
    ).toBeTruthy();
  });

  it("shows the fee scale in rands but not last year's spend amounts", async () => {
    asRank("camp_member");
    render(await AboutPage());
    const scale = screen.getByRole("list", { name: "Fee scale" });
    expect(within(scale).getByText(/R\s8\s000,00/)).toBeTruthy();
    const shade = DEFAULT_JOIN_CONTENT.fee.spend[0]!;
    expect(screen.getByText(shade.what)).toBeTruthy();
    expect(screen.queryByText(/100\s000/)).toBeNull();
  });
});
