import { describe, expect, it } from "vitest";
import {
  DutyCard,
  DutyCardDraft,
  EMPTY_DUTY_CARD,
  GuideSlug,
  NewGuideChapterInput,
  SaveGuideChapterInput,
  containsPhoneNumber,
} from "../guide";

describe("the Survival Guide's shapes", () => {
  const base = {
    title: "Dishwashing",
    category: "kitchen",
    team: "kitchen",
    markdown: "Three basins.",
  };

  it("keeps a card on a duty card and none on a chapter", () => {
    expect(
      NewGuideChapterInput.safeParse({ ...base, kind: "chapter", card: null })
        .success,
    ).toBe(true);
    expect(
      NewGuideChapterInput.safeParse({
        ...base,
        kind: "duty_card",
        card: EMPTY_DUTY_CARD,
      }).success,
    ).toBe(true);
    expect(
      NewGuideChapterInput.safeParse({ ...base, kind: "duty_card", card: null })
        .success,
    ).toBe(false);
    expect(
      NewGuideChapterInput.safeParse({
        ...base,
        kind: "chapter",
        card: EMPTY_DUTY_CARD,
      }).success,
    ).toBe(false);
  });

  it("refuses a topic the guide does not have and a team that is not one", () => {
    expect(
      NewGuideChapterInput.safeParse({
        ...base,
        category: "gossip",
        kind: "chapter",
        card: null,
      }).success,
    ).toBe(false);
    expect(
      NewGuideChapterInput.safeParse({
        ...base,
        team: "bakery",
        kind: "chapter",
        card: null,
      }).success,
    ).toBe(false);
  });

  it("lets a save leave the topic out, so a connector's free-text topic stays", () => {
    const save = {
      ...base,
      slug: "packing",
      expectedVersion: 2,
      card: null,
    };
    const { category: _category, ...withoutTopic } = save;
    const kept = SaveGuideChapterInput.safeParse(withoutTopic);
    expect(kept.success && kept.data.category).toBe(undefined);
    expect(SaveGuideChapterInput.safeParse(save).success).toBe(true);
    expect(
      SaveGuideChapterInput.safeParse({ ...save, category: "packing" }).success,
    ).toBe(false);
  });

  it("keeps the guide's own page words out of chapter slugs", () => {
    expect(GuideSlug.safeParse("drive-in").success).toBe(true);
    expect(GuideSlug.safeParse("new").success).toBe(false);
    expect(GuideSlug.safeParse("Drive In").success).toBe(false);
  });

  it("saves a half-written card as a draft, within bounds", () => {
    expect(DutyCardDraft.safeParse(EMPTY_DUTY_CARD).success).toBe(true);
    expect(
      DutyCardDraft.safeParse({ ...EMPTY_DUTY_CARD, steps: ["x".repeat(301)] })
        .success,
    ).toBe(false);
  });

  it("spots a phone number however it is typed", () => {
    expect(containsPhoneNumber("082 555 1234")).toBe(true);
    expect(containsPhoneNumber("+27-82-555-1234")).toBe(true);
    expect(containsPhoneNumber("(021) 555.1234")).toBe(true);
    expect(containsPhoneNumber("Shift 06:00–08:00, 2–3 people")).toBe(false);
  });

  it("publishes a card with no typed shift key: shifts link to their card now (#250)", () => {
    const card = {
      subRoles: [{ name: "Washing", min: 2, max: 2 }],
      steps: ["Fill the basins."],
      hardRules: [],
      checklist: [],
      askRole: "The Kitchen lead",
    };
    expect(DutyCard.safeParse(card).success).toBe(true);
    // A key typed before stays readable, and an empty one is no key.
    expect(
      DutyCard.safeParse({ ...card, shiftTypeKey: "morning-clean" }).success,
    ).toBe(true);
    expect(DutyCard.safeParse({ ...card, shiftTypeKey: "" }).success).toBe(
      true,
    );
    expect(
      DutyCard.safeParse({ ...card, shiftTypeKey: "Morning Clean!" }).success,
    ).toBe(false);
    expect(EMPTY_DUTY_CARD).not.toHaveProperty("shiftTypeKey");
  });
});
