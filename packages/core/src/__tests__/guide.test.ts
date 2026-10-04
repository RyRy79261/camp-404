import { describe, expect, it } from "vitest";
import {
  DUTY_CARD_NO_MEMBERS_ONLY,
  Team,
  type DutyCardDraft,
} from "@camp404/types";
import {
  canEditAnyGuideChapter,
  canEditGuideChapter,
  canSetGuideChapterMembersOnly,
  canSetGuideSectionPublic,
  dutyCardProblem,
  guideChapterIsPublic,
  guideReadMark,
  guideReviewDue,
  askRoleParts,
  headcountLabel,
  headcountText,
  printableDutyCard,
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

describe("the public site's switches", () => {
  it("are a captain's alone, failing closed on an unknown rank", () => {
    for (const can of [
      canSetGuideSectionPublic,
      canSetGuideChapterMembersOnly,
    ]) {
      expect(can("captain")).toBe(true);
      expect(can("team_lead")).toBe(false);
      expect(can("camp_member")).toBe(false);
      expect(can("root")).toBe(false);
    }
  });
});

describe("guideChapterIsPublic", () => {
  it("needs all three: published, a public section, and no members-only mark", () => {
    const yes = { published: true, sectionPublic: true, membersOnly: false };
    expect(guideChapterIsPublic(yes)).toBe(true);
    expect(guideChapterIsPublic({ ...yes, published: false })).toBe(false);
    expect(guideChapterIsPublic({ ...yes, sectionPublic: false })).toBe(false);
    expect(guideChapterIsPublic({ ...yes, membersOnly: true })).toBe(false);
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

  it("refuses a Members only part: a card goes out whole or not at all", () => {
    expect(dutyCardProblem(card, "Gloves.\n\n:::members\nCode 12.\n:::")).toBe(
      DUTY_CARD_NO_MEMBERS_ONLY,
    );
    // Even one the writer's rules would refuse.
    expect(dutyCardProblem(card, "> ::: Members")).toBe(
      DUTY_CARD_NO_MEMBERS_ONLY,
    );
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

describe("headcountText", () => {
  it("says person for one and people for more or a range", () => {
    expect(headcountText(1, 1)).toBe("1 person");
    expect(headcountText(2, 2)).toBe("2 people");
    expect(headcountText(1, 2)).toBe("1–2 people");
    expect(headcountText(0, 0)).toBe("0 people");
  });
});

describe("askRoleParts", () => {
  it("adds 'the' to a bare role and keeps an article the writer typed", () => {
    expect(askRoleParts("Kitchen lead on shift")).toEqual({
      article: "the",
      role: "Kitchen lead on shift",
    });
    expect(askRoleParts("The Sanitation lead")).toEqual({
      article: "the",
      role: "Sanitation lead",
    });
    expect(askRoleParts("Any captain")).toEqual({
      article: "any",
      role: "captain",
    });
    // "Theatre lead" starts with "the" but has no article.
    expect(askRoleParts("Theatre lead")).toEqual({
      article: "the",
      role: "Theatre lead",
    });
  });

  it("is empty when the card names no one", () => {
    expect(askRoleParts("   ")).toBeNull();
  });
});

describe("printableDutyCard", () => {
  it("words each sub-role's headcount and keeps every filled part", () => {
    const out = printableDutyCard({
      subRoles: [
        { name: "Washer", min: 2, max: 2 },
        { name: "Dryer", min: 1, max: 2 },
        { name: "Shift lead", min: 1, max: 1 },
      ],
      steps: ["Boil water.", "Scrape plates."],
      hardRules: ["No grey water on the ground."],
      checklist: ["Gas off"],
      askRole: "Kitchen lead on shift",
    });
    expect(out.subRoles).toEqual([
      { name: "Washer", headcount: "2 people" },
      { name: "Dryer", headcount: "1–2 people" },
      { name: "Shift lead", headcount: "1 person" },
    ]);
    expect(out.steps).toEqual(["Boil water.", "Scrape plates."]);
    expect(out.hardRules).toHaveLength(1);
    expect(out.checklist).toEqual(["Gas off"]);
    expect(out.ask).toEqual({ article: "the", role: "Kitchen lead on shift" });
  });

  it("leaves out a draft's blank lines and unnamed sub-roles, so an empty section is not drawn", () => {
    const out = printableDutyCard({
      subRoles: [
        { name: "  ", min: 0, max: 0 },
        { name: " Washer ", min: 2, max: 1 },
      ],
      steps: ["", " Fill the basins. "],
      hardRules: ["  "],
      checklist: [],
      askRole: "",
    });
    expect(out.subRoles).toEqual([{ name: "Washer", headcount: "2 people" }]);
    expect(out.steps).toEqual(["Fill the basins."]);
    expect(out.hardRules).toEqual([]);
    expect(out.checklist).toEqual([]);
    expect(out.ask).toBeNull();
  });
});
