import { describe, expect, it } from "vitest";
import {
  type HomeLayout,
  type LayoutGroup,
  createCustomSection,
  dissolveSection,
  dropIndex,
  isHomeLayout,
  moveTile,
  reconcileLayout,
  renameCustomSection,
  seedLayout,
  sectionKey,
} from "./home-layout";

// A small stand-in catalogue: two unlocked-able groups + one captain group.
const CATALOGUE: LayoutGroup[] = [
  { id: "captain", tiles: [{ id: "cap-a" }, { id: "cap-b" }] },
  { id: "team-lead", tiles: [{ id: "lead-a" }] },
  { id: "team-member", tiles: [{ id: "mem-a" }, { id: "mem-b" }] },
];

const tileIdsByKey = (l: HomeLayout) =>
  Object.fromEntries(l.sections.map((s) => [sectionKey(s), s.tiles]));

describe("seedLayout", () => {
  it("seeds one rank section per unlocked group, in catalogue order, excluding locked", () => {
    const l = seedLayout(CATALOGUE, ["captain"]);
    expect(l.v).toBe(2);
    expect(l.sections.map(sectionKey)).toEqual(["rank:team-lead", "rank:team-member"]);
    expect(tileIdsByKey(l)["rank:team-member"]).toEqual(["mem-a", "mem-b"]);
  });

  it("seeds every group when nothing is locked", () => {
    const l = seedLayout(CATALOGUE, []);
    expect(l.sections.map(sectionKey)).toEqual([
      "rank:captain",
      "rank:team-lead",
      "rank:team-member",
    ]);
  });
});

describe("reconcileLayout — locked exclusion (security invariant)", () => {
  it("drops a tile that was placed in a custom/loose section but is now locked", () => {
    // A tampered/stale layout that smuggled a captain tile into a custom group.
    const saved: HomeLayout = {
      v: 2,
      sections: [
        { kind: "custom", id: "c1", title: "Faves", tiles: ["cap-a", "mem-a"] },
        { kind: "rank", id: "team-member", tiles: ["mem-b"] },
      ],
    };
    const out = reconcileLayout(saved, CATALOGUE, ["captain"]);
    const all = out.sections.flatMap((s) => s.tiles);
    expect(all).not.toContain("cap-a"); // captain tile dropped
    expect(all).toContain("mem-a");
    expect(all).toContain("mem-b");
  });
});

describe("reconcileLayout — catalogue drift", () => {
  it("drops tiles no longer in the catalogue", () => {
    const saved: HomeLayout = {
      v: 2,
      sections: [{ kind: "rank", id: "team-member", tiles: ["mem-a", "gone", "mem-b"] }],
    };
    const out = reconcileLayout(saved, CATALOGUE, ["captain", "team-lead"]);
    expect(tileIdsByKey(out)["rank:team-member"]).toEqual(["mem-a", "mem-b"]);
  });

  it("places a new catalogue tile into its home rank section", () => {
    const saved: HomeLayout = {
      v: 2,
      sections: [{ kind: "rank", id: "team-member", tiles: ["mem-a"] }],
    };
    const out = reconcileLayout(saved, CATALOGUE, ["captain", "team-lead"]);
    expect(tileIdsByKey(out)["rank:team-member"]).toContain("mem-b");
  });

  it("seeds a fresh section for a newly-unlocked group", () => {
    const saved: HomeLayout = {
      v: 2,
      sections: [{ kind: "rank", id: "team-member", tiles: ["mem-a", "mem-b"] }],
    };
    // team-lead is now unlocked but absent from the saved layout.
    const out = reconcileLayout(saved, CATALOGUE, ["captain"]);
    expect(out.sections.some((s) => sectionKey(s) === "rank:team-lead")).toBe(true);
    expect(tileIdsByKey(out)["rank:team-lead"]).toEqual(["lead-a"]);
  });

  it("dedupes a tile listed in two sections, keeping the first", () => {
    const saved: HomeLayout = {
      v: 2,
      sections: [
        { kind: "custom", id: "c1", title: "A", tiles: ["mem-a"] },
        { kind: "rank", id: "team-member", tiles: ["mem-a", "mem-b"] },
      ],
    };
    const out = reconcileLayout(saved, CATALOGUE, ["captain", "team-lead"]);
    expect(tileIdsByKey(out)["custom:c1"]).toEqual(["mem-a"]);
    expect(tileIdsByKey(out)["rank:team-member"]).toEqual(["mem-b"]);
  });

  it("drops empty custom/loose sections but keeps an empty rank section", () => {
    const saved: HomeLayout = {
      v: 2,
      sections: [
        { kind: "custom", id: "c1", title: "Empty", tiles: [] },
        { kind: "loose", tiles: [] },
        { kind: "rank", id: "team-member", tiles: [] },
      ],
    };
    const out = reconcileLayout(saved, CATALOGUE, ["captain", "team-lead"]);
    const keys = out.sections.map(sectionKey);
    expect(keys).not.toContain("custom:c1");
    expect(keys).not.toContain("loose");
    expect(keys).toContain("rank:team-member");
  });
});

describe("moveTile", () => {
  const base = seedLayout(CATALOGUE, ["captain"]).sections; // lead + member

  it("moves a tile across sections at an index", () => {
    const out = moveTile(base, "lead-a", "rank:team-member", 1);
    expect(out.find((s) => sectionKey(s) === "rank:team-lead")?.tiles).toEqual([]);
    expect(out.find((s) => sectionKey(s) === "rank:team-member")?.tiles).toEqual([
      "mem-a",
      "lead-a",
      "mem-b",
    ]);
  });

  it("reorders within a section", () => {
    const out = moveTile(base, "mem-b", "rank:team-member", 0);
    expect(out.find((s) => sectionKey(s) === "rank:team-member")?.tiles).toEqual([
      "mem-b",
      "mem-a",
    ]);
  });

  it("appends when the index is omitted/out of range, and no-ops on unknown target/tile", () => {
    expect(moveTile(base, "lead-a", "rank:team-member")
      .find((s) => sectionKey(s) === "rank:team-member")?.tiles)
      .toEqual(["mem-a", "mem-b", "lead-a"]);
    expect(moveTile(base, "lead-a", "custom:nope")).toEqual(base);
    // Unknown tile must not be injected as a phantom id.
    expect(moveTile(base, "ghost", "rank:team-member")).toEqual(base);
  });
});

describe("dropIndex (cross-container drop lands on the preview, not one past it)", () => {
  // After a cross-container dragOver, the active tile is already in the target,
  // so the index must be computed with it excluded.
  it("returns the over-tile's index in the active-excluded list", () => {
    // target after dragOver placed `a` before `over`: [a, over, x]
    expect(dropIndex(["a", "over", "x"], "a", "over", false)).toBe(0);
    expect(dropIndex(["x", "a", "over"], "a", "over", false)).toBe(1);
  });
  it("appends when dropping on the empty container", () => {
    expect(dropIndex(["a", "x"], "a", "rank:team-member", true)).toBe(1);
    expect(dropIndex([], "a", "loose", true)).toBe(0);
  });
  it("appends when the over id isn't found", () => {
    expect(dropIndex(["a", "x"], "a", "missing", false)).toBe(1);
  });
});

describe("create / rename / dissolve", () => {
  const base = seedLayout(CATALOGUE, ["captain"]).sections;

  it("creates an empty custom section", () => {
    const out = createCustomSection(base, "c-new");
    const created = out.find((s) => sectionKey(s) === "custom:c-new");
    expect(created).toMatchObject({ kind: "custom", title: "New group", tiles: [] });
  });

  it("renames a custom section", () => {
    const withCustom = createCustomSection(base, "c-new");
    const out = renameCustomSection(withCustom, "c-new", "Favourites");
    expect(out.find((s) => sectionKey(s) === "custom:c-new")).toMatchObject({
      title: "Favourites",
    });
  });

  it("dissolves a rank section into a new loose bucket", () => {
    const out = dissolveSection(base, "rank:team-lead");
    expect(out.some((s) => sectionKey(s) === "rank:team-lead")).toBe(false);
    expect(out.find((s) => s.kind === "loose")?.tiles).toEqual(["lead-a"]);
  });

  it("merges into the existing loose bucket on a second dissolve", () => {
    const once = dissolveSection(base, "rank:team-lead");
    const twice = dissolveSection(once, "rank:team-member");
    expect(twice.find((s) => s.kind === "loose")?.tiles).toEqual([
      "lead-a",
      "mem-a",
      "mem-b",
    ]);
  });

  it("won't dissolve the loose bucket itself", () => {
    const once = dissolveSection(base, "rank:team-lead");
    expect(dissolveSection(once, "loose")).toEqual(once);
  });
});

describe("isHomeLayout", () => {
  it("accepts a valid v2 layout and rejects junk", () => {
    expect(isHomeLayout({ v: 2, sections: [{ kind: "loose", tiles: ["x"] }] })).toBe(true);
    expect(isHomeLayout({ v: 1, sections: [] })).toBe(false);
    expect(isHomeLayout({ v: 2, sections: [{ kind: "rank", tiles: ["x"] }] })).toBe(false); // no id
    expect(isHomeLayout({ v: 2, sections: [{ kind: "rank", id: "x", tiles: [1] }] })).toBe(false);
    expect(isHomeLayout(null)).toBe(false);
  });
});
