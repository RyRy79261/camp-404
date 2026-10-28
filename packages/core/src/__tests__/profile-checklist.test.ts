import { describe, expect, it } from "vitest";
import {
  displayNameIsEmail,
  profileChecklist,
  profileChecklistTitle,
  type ProfileFacts,
} from "../profile-checklist";

const facts = (over: Partial<ProfileFacts> = {}): ProfileFacts => ({
  approved: true,
  held: false,
  displayName: "lerato.m@gmail.com",
  telegramHandle: null,
  telegramConnected: false,
  hasEmergencyContact: true,
  ...over,
});

const ON = { telegramOffered: true };

describe("profileChecklist (owner's mock-up, step 6)", () => {
  it("lists the four lines, ticking what is done", () => {
    const list = profileChecklist(facts(), ON)!;
    expect(list.items.map((i) => [i.key, i.done, i.href])).toEqual([
      ["telegram_connect", false, "/profile#telegram"],
      ["telegram_username", false, "/tools/forms/burner_profile"],
      ["display_name", false, "/profile/edit"],
      ["emergency_contact", true, "/tools/forms/burner_profile"],
    ]);
    expect(list.missing).toBe(3);
    expect(profileChecklistTitle(list.missing)).toBe(
      "Your profile isn't finished: 3 things missing",
    );
  });

  it("ticks each line as it is fixed", () => {
    const list = profileChecklist(
      facts({
        displayName: "Lerato",
        telegramHandle: "@lerato",
        telegramConnected: true,
      }),
      ON,
    )!;
    expect(list.missing).toBe(0);
    expect(list.items.every((i) => i.done)).toBe(true);
  });

  it("leaves out Connect Telegram when Ol' Jeb is not set up", () => {
    const list = profileChecklist(facts(), { telegramOffered: false })!;
    expect(list.items.map((i) => i.key)).not.toContain("telegram_connect");
    expect(list.missing).toBe(2);
  });

  it("gives an applicant or a held member no checklist", () => {
    expect(profileChecklist(facts({ approved: false }), ON)).toBeNull();
    expect(profileChecklist(facts({ held: true }), ON)).toBeNull();
    expect(profileChecklist(null, ON)).toBeNull();
  });

  it("says one thing, not one things", () => {
    expect(profileChecklistTitle(1)).toBe(
      "Your profile isn't finished: 1 thing missing",
    );
  });
});

describe("displayNameIsEmail", () => {
  it("is true for an address or no name, false for a name", () => {
    expect(displayNameIsEmail("a@b.co")).toBe(true);
    expect(displayNameIsEmail("  ")).toBe(true);
    expect(displayNameIsEmail(null)).toBe(true);
    expect(displayNameIsEmail("Lerato M")).toBe(false);
    expect(displayNameIsEmail("DJ @ night")).toBe(false);
  });
});
