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
    expect(
      screen.queryByRole("link", { name: /Edit in Join site/ }),
    ).toBeNull();
    expect(captainPageGate).toHaveBeenCalledWith("camp_member");
  });

  it("offers a team lead no way to edit it either", async () => {
    asRank("team_lead");
    render(await AboutPage());
    expect(
      screen.queryByRole("link", { name: /Edit in Join site/ }),
    ).toBeNull();
  });

  it("sends a captain to the Join site program to edit it, saying the join site changes too", async () => {
    asRank("captain");
    render(await AboutPage());
    expect(
      screen
        .getByRole("link", { name: /Edit in Join site/ })
        .getAttribute("href"),
    ).toBe("/captains/join-site");
    expect(screen.getByText("Also changes join.camp-404.com")).toBeTruthy();
  });

  it("lists the page's cards in On this page", async () => {
    asRank("camp_member");
    render(await AboutPage());
    const [column] = screen.getAllByRole("navigation", {
      name: "On this page",
    });
    for (const name of ["Who we are", "The camp fee", "Getting there"]) {
      expect(within(column!).getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByRole("region", { name: "The camp fee" }).id).toBe(
      "about-fee",
    );
  });

  it("shows bold and italic a captain set in the words", async () => {
    vi.mocked(getAboutCamp).mockResolvedValue({
      ...ABOUT,
      content: {
        ...DEFAULT_JOIN_CONTENT,
        readme: {
          ...DEFAULT_JOIN_CONTENT.readme,
          paragraphs: ["In the desert **everyone** builds, *really*."],
        },
      },
    });
    asRank("camp_member");
    render(await AboutPage());
    expect(screen.getByText("everyone").tagName).toBe("STRONG");
    expect(screen.getByText("really").tagName).toBe("EM");
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it("asks members to invite a friend, not to sign up themselves", async () => {
    asRank("camp_member");
    render(await AboutPage());
    expect(
      screen.getByRole("link", { name: "Open Invites" }).getAttribute("href"),
    ).toBe("/tools/invite");
    expect(
      screen.queryByText(DEFAULT_JOIN_CONTENT.readme.steps[1]!),
    ).toBeNull();
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

  it("drops the 'dates to be confirmed' note once the Burn's dates are set", async () => {
    asRank("camp_member");
    render(await AboutPage());
    expect(
      screen.queryByText(DEFAULT_JOIN_CONTENT.schedule.datesNote, {
        exact: false,
      }),
    ).toBeNull();
  });

  it("shows the 'dates to be confirmed' note while the Burn's dates are unset", async () => {
    vi.mocked(getAboutCamp).mockResolvedValue({ ...ABOUT, burn: null });
    asRank("camp_member");
    render(await AboutPage());
    expect(
      screen.getByText(DEFAULT_JOIN_CONTENT.schedule.datesNote, {
        exact: false,
      }),
    ).toBeTruthy();
  });

  it("shows the fee scale in whole rands but not last year's spend amounts", async () => {
    asRank("camp_member");
    render(await AboutPage());
    const scale = screen.getByRole("list", { name: "Fee scale" });
    expect(within(scale).getByText(/^R\s8\s000$/)).toBeTruthy();
    // Subsidy reads first.
    expect(within(scale).getAllByRole("listitem")[0]!.textContent).toContain(
      DEFAULT_JOIN_CONTENT.fee.subsidy.name,
    );
    const shade = DEFAULT_JOIN_CONTENT.fee.spend[0]!;
    expect(screen.getByText(shade.what)).toBeTruthy();
    expect(screen.queryByText(/100\s000/)).toBeNull();
  });

  it("leaves the tent fee out while it says TBC, and shows it once it has an amount", async () => {
    asRank("camp_member");
    render(await AboutPage());
    expect(
      within(screen.getByRole("list", { name: "Fee scale" })).queryByText(
        "Tent fee",
      ),
    ).toBeNull();
    cleanup();

    vi.mocked(getAboutCamp).mockResolvedValue({
      ...ABOUT,
      content: {
        ...DEFAULT_JOIN_CONTENT,
        fee: { ...DEFAULT_JOIN_CONTENT.fee, tentFee: "R 900" },
      },
    });
    render(await AboutPage());
    const scale = screen.getByRole("list", { name: "Fee scale" });
    expect(within(scale).getByText("Tent fee")).toBeTruthy();
    expect(within(scale).getByText("R 900")).toBeTruthy();
  });
});
