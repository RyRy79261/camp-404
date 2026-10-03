import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "Print all duty cards" (#250): every published card, one per page, in one
// PDF, the whole camp's first and then each team's in the camp's order. The
// list comes from the published versions only (listPublishedDutyCardsInFull:
// no draft and no card taken off, packages/db documents.test.ts); each card
// gets its own named page, so its own footer.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/camp-config", () => ({ getTeamsConfig: vi.fn() }));
vi.mock("@/lib/guide", () => ({ listPublishedDutyCardsInFull: vi.fn() }));
vi.mock("@/lib/shifts", () => ({ getShiftsForDutyCards: vi.fn() }));

import type { DutyCard } from "@camp404/types";
import { captainPageGate } from "@/lib/captain-gate";
import { getTeamsConfig } from "@/lib/camp-config";
import { listPublishedDutyCardsInFull } from "@/lib/guide";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import { getShiftsForDutyCards } from "@/lib/shifts";
import DutyCardsPrintPage from "./page";

const CARD: DutyCard = {
  subRoles: [{ name: "Washer", min: 2, max: 2 }],
  steps: ["Fill the basins."],
  hardRules: [],
  checklist: [],
  askRole: "The Sanitation lead",
};

function card(id: string, title: string, team: string | null, version = 1) {
  return {
    id,
    slug: id,
    title,
    category: "on_site",
    team,
    kind: "duty_card",
    version,
    publishedAt: new Date("2027-04-12T10:00:00Z"),
    cycleReviewed: 2027,
    markdown: "",
    card: CARD,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "member" },
    rank: "camp_member",
    cleared: true,
  } as never);
  vi.mocked(getTeamsConfig).mockResolvedValue({
    teams: [
      { key: "structures", label: "Structures" },
      { key: "kitchen", label: "Kitchen" },
    ],
  } as never);
  vi.mocked(listPublishedDutyCardsInFull).mockResolvedValue([
    card("dishes", "Dishes", "kitchen", 3),
    card("gate", "Gate shift", null),
    card("shade", "Shade up", "structures"),
  ] as never);
  vi.mocked(getShiftsForDutyCards).mockImplementation(
    async (ids) =>
      new Map(
        ids.map((id) => [
          id,
          id === "dishes"
            ? [
                {
                  id: "t1",
                  name: "Dinner dishes",
                  teamLabel: "Kitchen",
                  timeText: "20:00–21:00",
                  daysText: "every day",
                },
              ]
            : [],
        ]),
      ),
  );
});

afterEach(cleanup);

describe("print all duty cards", () => {
  it("prints every published card, one per page, the whole camp's first then by team", async () => {
    const { container } = render(await DutyCardsPrintPage());
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
    const cards = screen.getAllByTestId("duty-card");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Gate shift",
      "Shade up",
      "Dishes",
    ]);
    expect(cards[0]?.textContent).toContain(
      "Camp 404 · Duty card · Whole camp",
    );
    expect(cards[0]?.textContent).toContain("Stuck? Ask the Sanitation lead.");
    expect(cards[2]?.textContent).toContain(
      "Used by: Dinner dishes 20:00–21:00",
    );
    expect(cards[2]?.textContent).toContain("version 3");
    expect(cards.map((c) => c.style.getPropertyValue("page"))).toEqual([
      "duty-card-0",
      "duty-card-1",
      "duty-card-2",
    ]);
    const rules = [...container.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(rules).toContain("@page duty-card-2");
    // The shifts are read once for every card.
    expect(getShiftsForDutyCards).toHaveBeenCalledTimes(1);
  });

  it("says so when no card is published", async () => {
    vi.mocked(listPublishedDutyCardsInFull).mockResolvedValue([]);
    render(await DutyCardsPrintPage());
    expect(screen.getByText("No duty cards are published yet.")).toBeTruthy();
    expect(screen.queryByTestId("duty-card")).toBeNull();
  });
});
