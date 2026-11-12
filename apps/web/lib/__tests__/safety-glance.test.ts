import { describe, expect, it } from "vitest";
import {
  SAFETY_LINKS,
  SAFETY_LEAD_NOTE,
  SAFETY_MEMBER_NOTE,
  safetyGlance,
} from "../team-glance/safety";

// The Safety team page's panel: counts for a captain or a Safety lead, and a
// member's own "Set" / "Not set yet", never the contact itself.

const counts = {
  coming: 48,
  noEmergencyContact: 5,
  burnerProfileDone: 39,
  anaphylactic: 2,
  allergiesNoted: 7,
};

describe("safetyGlance", () => {
  it("shows a member only whether their own emergency contact is set", () => {
    const unset = safetyGlance({ view: "member", hasEmergencyContact: false });
    expect(unset.tiles).toEqual([
      expect.objectContaining({ value: "Not set yet", tone: "warn" }),
    ]);
    expect(unset.attention[0]!.link).toEqual(SAFETY_LINKS.myForms);
    expect(unset.note).toBe(SAFETY_MEMBER_NOTE);

    const set = safetyGlance({ view: "member", hasEmergencyContact: true });
    expect(set.tiles[0]).toMatchObject({ value: "Set", tone: "ok" });
    expect(set.attention).toEqual([]);
  });

  it("gives a reader the counts and what needs attention", () => {
    const g = safetyGlance({ view: "reader", counts, isCaptain: false });
    const byKey = Object.fromEntries(g.tiles.map((t) => [t.key, t]));
    expect(byKey["no-contact"]).toMatchObject({ value: "5", tone: "bad" });
    expect(byKey["no-contact"]!.hint).toBe("of 48 people coming");
    expect(byKey.anaphylactic!.value).toBe("2");
    expect(byKey.profile).toMatchObject({
      value: "39 of 48",
      progress: { value: 39, max: 48 },
    });
    expect(byKey.allergies!.value).toBe("7");
    expect(g.attention.map((a) => a.text)).toEqual([
      "5 people coming have no emergency contact.",
      "9 people coming have not finished their burner profile.",
    ]);
    // The Camp sheet is a captain's page.
    expect(g.links).toEqual([SAFETY_LINKS.roster]);
    expect(
      safetyGlance({ view: "reader", counts, isCaptain: true }).links,
    ).toEqual([SAFETY_LINKS.roster, SAFETY_LINKS.campSheet]);
  });

  it("sends a captain to the Camp sheet for who, and tells a lead to ask one", () => {
    const lead = safetyGlance({ view: "reader", counts, isCaptain: false });
    expect(lead.attention.every((a) => a.link === undefined)).toBe(true);
    expect(lead.note).toBe(SAFETY_LEAD_NOTE);
    const captain = safetyGlance({ view: "reader", counts, isCaptain: true });
    expect(captain.attention.map((a) => a.link)).toEqual([
      SAFETY_LINKS.campSheet,
      SAFETY_LINKS.campSheet,
    ]);
    expect(captain.note).toBeUndefined();
  });

  it("asks for nothing when everyone is done", () => {
    const g = safetyGlance({
      view: "reader",
      counts: { ...counts, noEmergencyContact: 0, burnerProfileDone: 48 },
      isCaptain: false,
    });
    expect(g.attention).toEqual([]);
    expect(g.tiles[0]!.tone).toBe("ok");
  });
});
