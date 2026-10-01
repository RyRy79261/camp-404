import { describe, expect, it } from "vitest";
import { GUIDE_SLUG_MAX } from "@camp404/types";
import {
  groupByTeam,
  groupByTopic,
  guideCategoryLabel,
  guideSlugFor,
  guideTopicOptions,
  guideTopicToSave,
  guideVersionPath,
} from "../guide-copy";

const chapters = [
  { id: "a", category: "safety", team: null },
  { id: "b", category: "before_you_come", team: "kitchen" },
  { id: "c", category: "manual", team: "kitchen" },
  { id: "d", category: "safety", team: "bakery" },
];

describe("the guide's contents", () => {
  it("groups by topic in reading order, leaving empty topics out", () => {
    expect(
      groupByTopic(chapters).map((g) => [g.label, g.chapters.map((c) => c.id)]),
    ).toEqual([
      ["Before you come", ["b"]],
      ["Safety", ["a", "d"]],
      ["manual", ["c"]],
    ]);
  });

  it("groups by team, the whole camp first, a team settings no longer name last", () => {
    expect(
      groupByTeam(chapters, [
        { key: "structures", label: "Structures" },
        { key: "kitchen", label: "Kitchen" },
      ]).map((g) => [g.label, g.chapters.map((c) => c.id)]),
    ).toEqual([
      ["Whole camp", ["a"]],
      ["Kitchen", ["b", "c"]],
      ["bakery", ["d"]],
    ]);
  });

  it("names topics and links versions", () => {
    expect(guideCategoryLabel("on_site")).toBe("On site");
    expect(guideVersionPath("drive-in", 2)).toBe("/guide/drive-in/versions/2");
  });

  it("offers a connector's free-text topic in the editor and never sends it, so a save keeps it", () => {
    expect(guideTopicOptions("packing").map((o) => o.value)).toEqual([
      "before_you_come",
      "on_site",
      "kitchen",
      "safety",
      "teams",
      "packing",
    ]);
    expect(guideTopicOptions("kitchen")).toHaveLength(5);
    expect(guideTopicToSave("packing")).toBeUndefined();
    expect(guideTopicToSave("safety")).toBe("safety");
  });
});

describe("guideSlugFor", () => {
  it("cuts a long title at a whole word, never mid-word", () => {
    const slug = guideSlugFor(
      "Everything about the generators and fuel management on site",
      "abcde",
    );
    // slugify alone would give "...-fuel-managem".
    expect(slug).toBe("everything-about-the-generators-and-fuel");
    expect(slug.length).toBeLessThanOrEqual(GUIDE_SLUG_MAX);
  });

  it("keeps a short title as it is", () => {
    expect(guideSlugFor("Driving in", "abcde")).toBe("driving-in");
  });

  it("adds the suffix to an empty title, within the limit", () => {
    expect(guideSlugFor("!!!", "abcde")).toBe("chapter-abcde");
  });
});
