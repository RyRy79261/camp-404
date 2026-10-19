import { describe, expect, it } from "vitest";
import {
  MAX_CAMP_BLURB_LENGTH,
  MAX_CAMP_TITLE_LENGTH,
  campBlurbToSave,
  parseJoinSections,
} from "../join-site";

describe("parseJoinSections", () => {
  it("keeps the sections that pass and names the first that does not", () => {
    const teams = { intro: "Pick a team.", outro: ["See you."] };
    expect(parseJoinSections({ teams })).toEqual({
      ok: true,
      parsed: { teams },
    });
    expect(parseJoinSections({ teams, map: { where: 5 } })).toMatchObject({
      ok: false,
      section: "map",
    });
    expect(parseJoinSections({})).toEqual({ ok: true, parsed: {} });
  });
});

describe("campBlurbToSave", () => {
  it("trims and cuts each text to its limit, a blank as none", () => {
    expect(
      campBlurbToSave({
        title: ` ${"t".repeat(MAX_CAMP_TITLE_LENGTH + 1)}`,
        blurb: "  ",
        showOnJoin: true,
      }),
    ).toEqual({
      title: "t".repeat(MAX_CAMP_TITLE_LENGTH),
      blurb: null,
      showOnJoin: true,
    });
    expect(
      campBlurbToSave({
        title: null,
        blurb: "b".repeat(MAX_CAMP_BLURB_LENGTH + 9),
        showOnJoin: false,
      }).blurb,
    ).toHaveLength(MAX_CAMP_BLURB_LENGTH);
  });
});
