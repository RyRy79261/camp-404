import { describe, expect, it } from "vitest";
import { comparePinned, sortPinned, type PinnedOrder } from "../pinned-order";

const at = (iso: string) => new Date(iso);

function pin(over: Partial<PinnedOrder> & { id: string }): PinnedOrder {
  return {
    pinnedAt: at("2026-09-20T10:00:00Z"),
    pinnedByCaptain: false,
    ...over,
  };
}

const ids = (pins: readonly PinnedOrder[]) => pins.map((p) => p.id);

describe("sortPinned — newest pinned first", () => {
  it("orders by when it was PINNED, not when it was published", () => {
    const older = pin({ id: "a", pinnedAt: at("2026-09-18T09:00:00Z") });
    const newer = pin({ id: "b", pinnedAt: at("2026-09-21T09:00:00Z") });
    expect(ids(sortPinned([older, newer]))).toEqual(["b", "a"]);
    // and the other way in, so the answer is the sort's and not the input's
    expect(ids(sortPinned([newer, older]))).toEqual(["b", "a"]);
  });

  it("puts a captain's pin above a lead's when the times tie", () => {
    const tie = at("2026-09-20T10:00:00Z");
    const lead = pin({ id: "a", pinnedAt: tie, pinnedByCaptain: false });
    const captain = pin({ id: "z", pinnedAt: tie, pinnedByCaptain: true });
    // "z" would lose the id tiebreak, so this can only be the rank rule.
    expect(ids(sortPinned([lead, captain]))).toEqual(["z", "a"]);
    expect(ids(sortPinned([captain, lead]))).toEqual(["z", "a"]);
  });

  it("does not let a captain's pin jump an actually newer lead pin", () => {
    // Rank only breaks a TIE. A lead who pins something today is above a
    // captain's pin from last week.
    const captain = pin({
      id: "a",
      pinnedAt: at("2026-09-14T10:00:00Z"),
      pinnedByCaptain: true,
    });
    const lead = pin({ id: "b", pinnedAt: at("2026-09-21T10:00:00Z") });
    expect(ids(sortPinned([captain, lead]))).toEqual(["b", "a"]);
  });

  it("treats a pin whose setter is gone as not a captain's", () => {
    // `pinned_by` is `set null` on delete, so the caller reports false. The
    // order must not then claim captain priority it cannot prove.
    const tie = at("2026-09-20T10:00:00Z");
    const orphaned = pin({ id: "a", pinnedAt: tie, pinnedByCaptain: false });
    const captain = pin({ id: "b", pinnedAt: tie, pinnedByCaptain: true });
    expect(ids(sortPinned([orphaned, captain]))).toEqual(["b", "a"]);
  });
});

describe("comparePinned — the order is total", () => {
  it("breaks a full tie on the id, so two pins never swap between renders", () => {
    const tie = at("2026-09-20T10:00:00Z");
    const a = pin({ id: "aaa", pinnedAt: tie, pinnedByCaptain: true });
    const b = pin({ id: "bbb", pinnedAt: tie, pinnedByCaptain: true });
    expect(comparePinned(a, b)).toBeLessThan(0);
    expect(comparePinned(b, a)).toBeGreaterThan(0);
    // Every input order gives the same output order — the property that makes
    // a render stable.
    expect(ids(sortPinned([a, b]))).toEqual(["aaa", "bbb"]);
    expect(ids(sortPinned([b, a]))).toEqual(["aaa", "bbb"]);
  });

  it("compares a pin to itself as equal and nothing else", () => {
    const a = pin({ id: "aaa" });
    expect(comparePinned(a, a)).toBe(0);
  });

  it("agrees with itself over every permutation of a tricky set", () => {
    const tie = at("2026-09-20T10:00:00Z");
    const pins = [
      pin({ id: "1", pinnedAt: tie, pinnedByCaptain: true }),
      pin({ id: "2", pinnedAt: tie, pinnedByCaptain: false }),
      pin({ id: "3", pinnedAt: at("2026-09-21T10:00:00Z") }),
      pin({ id: "4", pinnedAt: tie, pinnedByCaptain: true }),
    ];
    const expected = ids(sortPinned(pins));
    expect(expected).toEqual(["3", "1", "4", "2"]);
    for (const permutation of permutations(pins)) {
      expect(ids(sortPinned(permutation))).toEqual(expected);
    }
  });

  it("leaves the caller's array alone", () => {
    const pins = [
      pin({ id: "b", pinnedAt: at("2026-09-18T10:00:00Z") }),
      pin({ id: "a", pinnedAt: at("2026-09-21T10:00:00Z") }),
    ];
    sortPinned(pins);
    expect(ids(pins)).toEqual(["b", "a"]);
  });
});

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}
