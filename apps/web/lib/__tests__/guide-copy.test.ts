import { describe, expect, it } from "vitest";
import {
  groupByTeam,
  groupByTopic,
  guideCategoryLabel,
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
});
