import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One duty card to print (#250, design/print-duty-card.html): every member
// prints a published card, with the team's strip and icon, the shifts that
// use it, who to ask, who does what, the steps, the hard rules and the
// checklist, and an empty section is not drawn. A draft prints only for
// someone who may edit the card; anyone else is refused outside the sheet,
// so there is no PDF of it.

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/camp-config", () => ({ getTeamsConfig: vi.fn() }));
vi.mock("@/lib/guide", () => ({
  getGuideDraft: vi.fn(),
  getPublishedChapter: vi.fn(),
}));
vi.mock("@/lib/shifts", () => ({ getDutyCardShifts: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));

import type { DutyCard } from "@camp404/types";
import { captainPageGate } from "@/lib/captain-gate";
import { getTeamsConfig } from "@/lib/camp-config";
import { getGuideDraft, getPublishedChapter } from "@/lib/guide";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import { getDutyCardShifts } from "@/lib/shifts";
import { getLeadTeams } from "@/lib/users";
import { TEAM_SHEET_STYLES } from "@camp404/ui/lib/team-style";
import DutyCardPrintPage from "./page";

const CARD: DutyCard = {
  subRoles: [
    { name: "Washer", min: 2, max: 2 },
    { name: "Dryer and pack-away", min: 1, max: 2 },
    { name: "Shift lead", min: 1, max: 1 },
  ],
  steps: [
    "Boil water for the wash basin.",
    "Scrape plates into the food-waste bucket.",
  ],
  hardRules: ["No grey water on the ground, ever."],
  checklist: ["Gas off at the bottle", "Bins closed and tied"],
  askRole: "Kitchen lead on shift",
};

const PUBLISHED = {
  id: "doc-1",
  slug: "evening-clean",
  title: "Evening clean",
  category: "kitchen",
  team: "kitchen",
  kind: "duty_card",
  version: 4,
  publishedAt: new Date("2027-04-12T10:00:00Z"),
  cycleReviewed: 2027,
  markdown: "",
  card: CARD,
  public: false,
  versions: [],
};

function gate(rank: "camp_member" | "team_lead" | "captain") {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: true,
  } as never);
}

function open(slug: string, draft?: string) {
  return DutyCardPrintPage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({ draft }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gate("camp_member");
  vi.mocked(getTeamsConfig).mockResolvedValue({
    teams: [{ key: "kitchen", label: "Kitchen" }],
  } as never);
  vi.mocked(getPublishedChapter).mockResolvedValue(PUBLISHED as never);
  vi.mocked(getLeadTeams).mockResolvedValue([]);
  vi.mocked(getDutyCardShifts).mockResolvedValue([
    {
      id: "t1",
      name: "Dinner dishes",
      teamLabel: "Kitchen",
      timeText: "20:00–21:00",
      daysText: "every day",
    },
    {
      id: "t2",
      name: "Kitchen close",
      teamLabel: "Kitchen",
      timeText: "21:00–21:30",
      daysText: "on 3 days",
    },
  ]);
});

afterEach(cleanup);

describe("the duty card print", () => {
  it("prints a published card for any member, as the mock-up lays it out", async () => {
    const { container } = render(await open("evening-clean"));
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
    const card = screen.getByTestId("duty-card");
    expect(card.textContent).toContain("Camp 404 · Duty card · Kitchen");
    expect(
      within(card).getByRole("heading", { level: 2, name: "Evening clean" }),
    ).toBeTruthy();
    expect(screen.getByTestId("duty-card-used-by").textContent).toContain(
      "Used by: Dinner dishes 20:00–21:00 · Kitchen close 21:00–21:30",
    );
    expect(card.textContent).toContain("Stuck? Ask the Kitchen lead on shift.");
    const roles = within(card).getByRole("list", { name: "Who does what" });
    expect(roles.textContent).toContain("Washer2 people");
    expect(roles.textContent).toContain("Dryer and pack-away1–2 people");
    expect(roles.textContent).toContain("Shift lead1 person");
    expect(
      within(within(card).getByRole("list", { name: "Steps" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(2);
    expect(card.textContent).toContain("Never skip these");
    expect(
      within(card).getByRole("list", { name: "Hard rules" }).textContent,
    ).toContain("No grey water on the ground, ever.");
    expect(card.textContent).toContain("Before you leave · shift lead ticks");
    expect(card.textContent).toContain(
      "Survival Guide · version 4 · updated 12 Apr 2027",
    );
    // The team's strip and icon colour are the daily site sheet's.
    expect(card.style.getPropertyValue("--edge")).toBe(
      TEAM_SHEET_STYLES.kitchen.edge,
    );
    // Its footer is on every sheet it takes: a named page with its own words.
    expect(card.style.getPropertyValue("page")).toBe("duty-card-0");
    const pageRules = [...container.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(pageRules).toContain("@page duty-card-0");
    expect(pageRules).toContain(
      '"Survival Guide · version 4 · updated 12 Apr 2027"',
    );
    expect(pageRules).toContain('counter(page) " of " counter(pages)');
    expect(getGuideDraft).not.toHaveBeenCalled();
  });

  it("leaves out Used by, the ask box, Hard rules and the checklist when the card has none", async () => {
    vi.mocked(getDutyCardShifts).mockResolvedValue([]);
    vi.mocked(getPublishedChapter).mockResolvedValue({
      ...PUBLISHED,
      team: null,
      card: { ...CARD, hardRules: [], checklist: [] },
    } as never);
    render(await open("evening-clean"));
    const card = screen.getByTestId("duty-card");
    expect(card.textContent).toContain("Camp 404 · Duty card · Whole camp");
    expect(screen.queryByTestId("duty-card-used-by")).toBeNull();
    expect(card.textContent).not.toContain("Hard rules");
    expect(card.textContent).not.toContain("Never skip these");
    expect(card.textContent).not.toContain("Before you leave");
    // The sections it has are still drawn.
    expect(card.textContent).toContain("Who does what");
    expect(card.textContent).toContain("Steps");
  });

  it("is a 404 for a chapter that is not a duty card, or not on the guide", async () => {
    vi.mocked(getPublishedChapter).mockResolvedValue({
      ...PUBLISHED,
      kind: "chapter",
      card: null,
    } as never);
    await expect(open("evening-clean")).rejects.toThrow("NEXT_NOT_FOUND");
    vi.mocked(getPublishedChapter).mockResolvedValue(null);
    await expect(open("gone")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  describe("a draft", () => {
    const DRAFT = {
      id: "doc-1",
      slug: "evening-clean",
      title: "Evening clean",
      category: "kitchen",
      team: "kitchen",
      kind: "duty_card",
      markdown: "",
      card: {
        ...CARD,
        steps: ["Not published yet.", ""],
        hardRules: [""],
      },
      version: 7,
      authorId: "someone",
      authorName: "Sipho Dlamini",
      published: true,
      publishedVersion: 4,
      public: false,
      cycleReviewed: 2027,
      updatedAt: new Date("2027-04-14T10:00:00Z"),
      changedSincePublish: true,
    };

    beforeEach(() => {
      vi.mocked(getGuideDraft).mockResolvedValue(DRAFT as never);
    });

    it("is refused outside the sheet for a member, and for a lead of another team", async () => {
      const member = render(await open("evening-clean", "1"));
      expect(screen.getByTestId("duty-card-refusal")).toBeTruthy();
      expect(
        member.container.querySelector(`[${PRINT_SHEET_ATTR}]`),
      ).toBeNull();
      expect(screen.queryByText("Not published yet.")).toBeNull();
      cleanup();

      gate("team_lead");
      vi.mocked(getLeadTeams).mockResolvedValue(["structures"]);
      const lead = render(await open("evening-clean", "1"));
      expect(screen.getByTestId("duty-card-refusal")).toBeTruthy();
      expect(lead.container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeNull();
    });

    it("prints the saved copy for a lead of its team, marked as a draft, with no author", async () => {
      gate("team_lead");
      vi.mocked(getLeadTeams).mockResolvedValue(["kitchen"]);
      const { container } = render(await open("evening-clean", "1"));
      expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
      const card = screen.getByTestId("duty-card");
      expect(card.textContent).toContain(
        "Camp 404 · Duty card (draft) · Kitchen",
      );
      expect(card.textContent).toContain("Not published yet.");
      // The draft's blank lines are left out, and so is an empty section.
      expect(
        within(within(card).getByRole("list", { name: "Steps" })).getAllByRole(
          "listitem",
        ),
      ).toHaveLength(1);
      expect(card.textContent).not.toContain("Never skip these");
      expect(card.textContent).toContain(
        "Survival Guide · draft, not published · saved 14 Apr 2027",
      );
      expect(container.textContent).not.toContain("Sipho");
      expect(getPublishedChapter).not.toHaveBeenCalled();
    });

    it("prints for a captain", async () => {
      gate("captain");
      const { container } = render(await open("evening-clean", "1"));
      expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
    });
  });
});
