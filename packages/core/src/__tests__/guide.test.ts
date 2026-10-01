import { describe, expect, it } from "vitest";
import { Team, type DutyCardDraft } from "@camp404/types";
import {
  canEditAnyGuideChapter,
  canEditGuideChapter,
  canSetGuideChapterPublic,
  dutyCardProblem,
  guideReadMark,
  guideReviewDue,
  headcountLabel,
} from "../guide";

const KITCHEN = Team.enum.kitchen;
const STRUCTURES = Team.enum.structures;

describe("canEditGuideChapter", () => {
  it("lets a captain write any chapter, a whole-camp one too", () => {
    expect(canEditGuideChapter("captain", [], KITCHEN)).toBe(true);
    expect(canEditGuideChapter("captain", [], null)).toBe(true);
  });

  it("lets a lead write only the chapters of a team they lead", () => {
    expect(canEditGuideChapter("team_lead", [KITCHEN], KITCHEN)).toBe(true);
    expect(canEditGuideChapter("team_lead", [KITCHEN], STRUCTURES)).toBe(false);
    expect(canEditGuideChapter("team_lead", [KITCHEN], null)).toBe(false);
  });

  it("refuses a member, even one who names a team", () => {
    expect(canEditGuideChapter("camp_member", [KITCHEN], KITCHEN)).toBe(false);
  });

  it("fails closed on an unknown rank or team, a captain's included", () => {
    expect(canEditGuideChapter("admin", [KITCHEN], KITCHEN)).toBe(false);
    expect(canEditGuideChapter("captain", [], "bakery")).toBe(false);
  });

  it("offers New chapter to captains and leads only", () => {
    expect(canEditAnyGuideChapter("captain", [])).toBe(true);
    expect(canEditAnyGuideChapter("team_lead", [KITCHEN])).toBe(true);
    expect(canEditAnyGuideChapter("team_lead", [])).toBe(false);
    expect(canEditAnyGuideChapter("camp_member", [])).toBe(false);
  });
});

describe("canSetGuideChapterPublic", () => {
  it("is a captain's alone", () => {
    expect(canSetGuideChapterPublic("captain")).toBe(true);
    expect(canSetGuideChapterPublic("team_lead")).toBe(false);
    expect(canSetGuideChapterPublic("camp_member")).toBe(false);
    expect(canSetGuideChapterPublic("root")).toBe(false);
  });
});

describe("guideReadMark", () => {
  it("says new, updated or nothing", () => {
    expect(guideReadMark(1, undefined)).toBe("new");
    expect(guideReadMark(3, 2)).toBe("updated");
    expect(guideReadMark(3, 3)).toBeNull();
  });
});

describe("guideReviewDue", () => {
  it("is due when last kept in an earlier year", () => {
    expect(guideReviewDue(2027, 2028)).toBe(true);
    expect(guideReviewDue(null, 2028)).toBe(true);
    expect(guideReviewDue(2028, 2028)).toBe(false);
    expect(guideReviewDue(2027, null)).toBe(false);
  });
});

describe("dutyCardProblem", () => {
  const card: DutyCardDraft = {
    shiftTypeKey: "evening-clean",
    subRoles: [{ name: "Dishes", min: 2, max: 3 }],
    steps: ["Wash."],
    hardRules: [],
    checklist: [],
    askRole: "Sanitation lead",
  };

  it("passes a whole card", () => {
    expect(dutyCardProblem(card, "")).toBeNull();
  });

  it("names the first thing missing", () => {
    expect(dutyCardProblem(null, "")).toBe(
      "A duty card needs its card filled in.",
    );
    expect(dutyCardProblem({ ...card, subRoles: [] }, "")).toBe(
      "Add at least one sub-role.",
    );
    expect(dutyCardProblem({ ...card, askRole: " " }, "")).toBe(
      "Say who to ask, as a role.",
    );
    expect(
      dutyCardProblem(
        {
          ...card,
          subRoles: [{ name: "Dishes", min: 3, max: 2 }],
        },
        "",
      ),
    ).toBe("A sub-role's most people can't be fewer than its fewest.");
  });

  it("refuses a phone number anywhere on the card", () => {
    expect(
      dutyCardProblem({ ...card, steps: ["If stuck, +27 82 555 1234."] }, ""),
    ).toMatch(/never a phone number/);
    expect(
      dutyCardProblem({ ...card, steps: ["From 06:00 to 08:00."] }, ""),
    ).toBe(null);
  });

  it("refuses a phone number in the card's Markdown, shown on the card as Good to know", () => {
    expect(
      dutyCardProblem(card, "Call Sam on 082 555 1234 if the gas runs out."),
    ).toMatch(/never a phone number/);
    expect(dutyCardProblem(card, "Ask the Kitchen lead at 06:00.")).toBeNull();
  });
});

describe("headcountLabel", () => {
  it("prints one number or a range", () => {
    expect(headcountLabel(2, 2)).toBe("2");
    expect(headcountLabel(2, 3)).toBe("2–3");
  });
});
