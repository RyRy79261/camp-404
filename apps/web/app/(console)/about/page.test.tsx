import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ABOUT_SECTIONS, DEFAULT_JOIN_CONTENT } from "@camp404/types";

// About Camp 404 (#264): every approved member reads the camp's intro, the
// Notion page "Intro to Camp 404" word for word and in its sections (Caitlin,
// 2026-11-15); only a captain is offered the way to edit it (the Join site
// program, whose own gate refuses anyone else).

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/about", () => ({ getAboutCamp: vi.fn() }));

import { captainPageGate } from "@/lib/captain-gate";
import { getAboutCamp } from "@/lib/about";
import AboutPage from "./page";

const ABOUT = { year: 2027, content: DEFAULT_JOIN_CONTENT };

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
    expect(
      screen.getByText(
        "Camp 404 is not appropriate for children or for adults who don’t act like children.",
      ),
    ).toBeTruthy();
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

  it("lists the Notion page's sections in its List of contents, in its order and by its names", async () => {
    asRank("camp_member");
    render(await AboutPage());
    const [column] = screen.getAllByRole("navigation", {
      name: "List of contents",
    });
    expect(
      within(column!)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([
      "How does a Theme Camp like 404 work?",
      "Camp 404’s Contributions to Tankwa Town",
      "Where is 404 in Tankwa Town?",
      "The Crew",
      "Responsibilities - What You Put In",
      "Camp Perks - What you Get Out",
      "How does 404 get stuff to Burn?",
    ]);
    for (const s of ABOUT_SECTIONS) {
      expect(screen.getByRole("region", { name: s.title }).id).toBe(
        `about-${s.key}`,
      );
    }
  });

  it("shows each section's words with the Notion page's bold, highlights and colours", async () => {
    asRank("camp_member");
    render(await AboutPage());
    const put = screen.getByRole("region", {
      name: "Responsibilities - What You Put In",
    });
    expect(
      within(put).getByText("Help Run Camp", { selector: "strong" }),
    ).toBeTruthy();
    // ==highlighted== and {{coloured}}, never their signs.
    expect(
      within(put).getByText(
        "Camp members are encouraged to arrive no later than Saturday the 25th April 2026.",
        { selector: "mark" },
      ),
    ).toBeTruthy();
    const works = screen.getByRole("region", {
      name: "How does a Theme Camp like 404 work?",
    });
    expect(
      within(works).getByText("Remember: YOU GET OUT WHAT YOU PUT IN", {
        selector: "span.md-accent",
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/==|\{\{|\+\+|\*\*/)).toBeNull();
  });

  it("shows the words a captain saved", async () => {
    vi.mocked(getAboutCamp).mockResolvedValue({
      ...ABOUT,
      content: {
        ...DEFAULT_JOIN_CONTENT,
        about: {
          ...DEFAULT_JOIN_CONTENT.about,
          sections: {
            ...DEFAULT_JOIN_CONTENT.about.sections,
            where: "We are on **plot 7**.",
          },
        },
      },
    });
    asRank("camp_member");
    render(await AboutPage());
    const where = screen.getByRole("region", {
      name: "Where is 404 in Tankwa Town?",
    });
    expect(within(where).getByText("plot 7").tagName).toBe("STRONG");
  });

  it("asks members to invite a friend", async () => {
    asRank("camp_member");
    render(await AboutPage());
    expect(
      screen.getByRole("link", { name: "Open Invites" }).getAttribute("href"),
    ).toBe("/tools/invite");
  });
});
