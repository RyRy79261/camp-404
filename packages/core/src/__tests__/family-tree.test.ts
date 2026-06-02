import { describe, expect, it } from "vitest";
import type { ReferralUser, TreeNode } from "@camp404/types";

import {
  buildTree,
  computeMatchIds,
  descendantCountLabel,
  subtreeHasMatch,
} from "../family-tree";

const u = (
  id: string,
  inviterId: string | null,
  displayName: string | null = id,
  inviteCode: string | null = null,
): ReferralUser => ({ id, displayName, rank: "member", inviteCode, inviterId });

function collectIds(trees: TreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (n: TreeNode) => {
    ids.add(n.user.id);
    n.children.forEach(walk);
  };
  trees.forEach(walk);
  return ids;
}

describe("buildTree", () => {
  it("nests children under inviters and counts all descendants", () => {
    const trees = buildTree([
      u("a", null),
      u("b", "a"),
      u("c", "b"),
      u("d", "a"),
    ]);
    expect(trees).toHaveLength(1);
    const a = trees[0];
    expect(a?.user.id).toBe("a");
    expect(a?.descendantCount).toBe(3); // b, c, d
    expect(a?.children.find((n) => n.user.id === "b")?.descendantCount).toBe(1);
  });

  it("treats accounts with no inviter as roots", () => {
    const trees = buildTree([u("a", null), u("b", null)]);
    expect(trees.map((t) => t.user.id).sort()).toEqual(["a", "b"]);
  });

  it("does not hang on a cyclic inviter chain — the back-edge becomes a root (OD9)", () => {
    expect(collectIds(buildTree([u("a", "b"), u("b", "a")]))).toEqual(
      new Set(["a", "b"]),
    );
  });

  it("ignores a self-parent", () => {
    const trees = buildTree([u("a", "a")]);
    expect(trees).toHaveLength(1);
    expect(trees[0]?.children).toHaveLength(0);
  });
});

describe("computeMatchIds", () => {
  const roster = [u("a", null, "Marlo"), u("b", "a", "Sara"), u("c", "b", "Dust")];

  it("returns null for an empty query", () => {
    expect(computeMatchIds(roster, "   ")).toBeNull();
  });

  it("matches by name/code and promotes ancestors", () => {
    expect(computeMatchIds(roster, "dust")).toEqual(new Set(["c", "b", "a"]));
  });

  it("does not hang on a cyclic ancestor chain (OD9)", () => {
    const ids = computeMatchIds(
      [u("a", "b", "Alpha"), u("b", "a", "Beta")],
      "alpha",
    );
    expect(ids?.has("a")).toBe(true);
  });
});

describe("descendantCountLabel", () => {
  it("pluralises", () => {
    expect(descendantCountLabel(1)).toBe("1 descendant");
    expect(descendantCountLabel(3)).toBe("3 descendants");
  });
});

describe("subtreeHasMatch", () => {
  it("finds a match in a descendant", () => {
    const root = buildTree([u("a", null), u("b", "a")])[0];
    expect(root ? subtreeHasMatch(root, new Set(["b"])) : null).toBe(true);
    expect(root ? subtreeHasMatch(root, new Set(["zzz"])) : null).toBe(false);
  });
});
