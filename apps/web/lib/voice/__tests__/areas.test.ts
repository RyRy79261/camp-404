import { describe, expect, it } from "vitest";
import { AREAS, TOOL_CAPABILITIES } from "../../mcp/capabilities";
import { ALWAYS, pickAreas } from "../areas";
import { CASES, type Expect, type ExpectedAction } from "../__eval__/cases";

// The area step (#356, cost) may send more than a command needs, never less:
// for every eval case, every tool its right answer uses is in an area the
// step picked.

function actionsOf(e: Expect): ExpectedAction[] {
  switch (e.kind) {
    case "list":
      return e.actions;
    case "ask":
      return [...e.options, ...(e.waiting ?? [])];
    case "either":
      return e.of.flatMap(actionsOf);
    default:
      return [];
  }
}

describe("picking the areas a command touches", () => {
  it("covers every tool each eval case's right answer needs", () => {
    const misses: string[] = [];
    for (const c of CASES) {
      const { areas } = pickAreas(c.words);
      for (const a of actionsOf(c.expect)) {
        const area = TOOL_CAPABILITIES[a.tool]!.area;
        if (!areas.includes(area)) misses.push(`${c.id}: ${a.tool} (${area})`);
      }
    }
    expect(misses).toEqual([]);
  });

  it("sends People and Search always, and every area when no word matches", () => {
    expect(pickAreas("Approve the gas bottles claim").areas).toEqual(
      expect.arrayContaining([...ALWAYS, "Claims and budgets"]),
    );
    expect(pickAreas("Banana telephone purple")).toEqual({
      areas: [...AREAS],
      fallback: true,
    });
  });

  it("sends a handful of areas for a typical command, not all of them", () => {
    const { areas, fallback } = pickAreas(
      "Sign me up for breakfast cooks on Wednesday, move the shade cloth task to done, and say I can help on build week",
    );
    expect(fallback).toBe(false);
    expect(areas).toEqual(
      expect.arrayContaining(["Shifts", "Tasks", "Logistics", "People"]),
    );
    expect(areas).not.toContain("Kitchen");
    expect(areas).not.toContain("Questionnaires");
  });

  it("adds every area a multi-part command names", () => {
    const { areas } = pickAreas(
      "Approve Sipho's claim, mark the shower pump task done, and ask for a lift",
    );
    expect(areas).toEqual(
      expect.arrayContaining([
        "Claims and budgets",
        "Tasks",
        "Transport",
        "People",
      ]),
    );
  });
});
