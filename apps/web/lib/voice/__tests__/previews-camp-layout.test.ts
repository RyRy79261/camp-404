// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../camp-layout", () => ({
  getCampLayout: vi.fn(),
  listLayoutVersions: vi.fn(async () => []),
  previousLayoutCycle: vi.fn(async () => null),
}));

import type { CampLayout } from "@camp404/types";
import {
  getCampLayout,
  listLayoutVersions,
  previousLayoutCycle,
  type CampLayoutState,
} from "../../camp-layout";
import type { McpScope } from "../../mcp/scope";
import { CAMP_LAYOUT_PREVIEWS } from "../previews-camp-layout";

// The camp layout's voice previews: what a save leaves is said from the plan
// sent and the plan saved, a plan read before someone else's save is never
// saved over it, and a restore or a copy that cannot be done is blocked.

const scope: McpScope = {
  campUserId: "11111111-1111-4111-8111-111111111111",
  rank: "captain",
  viewerRank: "captain",
  leadTeams: [],
  memberTeams: [],
  isDriver: false,
  isCaptain: true,
};
const ctx = { scope, now: new Date() };

const plan = (pieces: number, widthM = 40): CampLayout => ({
  plot: {
    widthM,
    depthM: 30,
    north: "top",
    part: "whole",
    edges: { top: "", right: "", bottom: "", left: "" },
  },
  pieces: Array.from({ length: pieces }, (_, i) => ({
    id: `p-${i}`,
    kind: "tent",
    label: "",
    x: i * 3,
    y: 0,
    w: 3,
    h: 3,
  })),
});

function state(version: number, layout: CampLayout | null): CampLayoutState {
  return {
    cycle: 2027,
    version,
    layout,
    note: null,
    savedAt: null,
    savedByName: null,
    shared: false,
  };
}

describe("camp layout previews", () => {
  it("says what the save leaves, and blocks a plan read before a newer save", async () => {
    vi.mocked(getCampLayout).mockResolvedValue(state(2, plan(3)));
    const p = await CAMP_LAYOUT_PREVIEWS.save_camp_layout!(
      { layout: plan(5, 50), expectedVersion: 2, note: "More tents" },
      ctx,
    );
    expect(p.blocked).toBeUndefined();
    expect(p.sentence).toBe("Save the camp layout as version 3");
    expect(p.change).toEqual([
      "Plot: 50 × 30 m, north at the top (was 40 × 30 m)",
      "Pieces: 5 (was 3)",
      "Note: “More tents”",
    ]);
    const stale = await CAMP_LAYOUT_PREVIEWS.save_camp_layout!(
      { layout: plan(5), expectedVersion: 1 },
      ctx,
    );
    expect(stale.blocked).toBe(
      "Someone saved the layout since it was read. Read it again.",
    );
  });

  it("restores at the latest version, and copies only into an empty year", async () => {
    vi.mocked(getCampLayout).mockResolvedValue(state(4, plan(3)));
    vi.mocked(listLayoutVersions).mockResolvedValue([
      {
        number: 2,
        note: null,
        savedAt: new Date(),
        savedByName: "Dee",
        pieces: 7,
      },
    ]);
    const p = await CAMP_LAYOUT_PREVIEWS.restore_camp_layout_version!(
      { number: 2, expectedVersion: 0 },
      ctx,
    );
    expect(p.args).toEqual({ number: 2, expectedVersion: 4 });
    expect(p.sentence).toBe("Restore camp layout version 2 as version 5");

    const copy = await CAMP_LAYOUT_PREVIEWS.copy_last_year_layout!({}, ctx);
    expect(copy.blocked).toMatch(/already has a layout/);
    vi.mocked(getCampLayout).mockResolvedValue(state(0, null));
    vi.mocked(previousLayoutCycle).mockResolvedValue(2026);
    const fresh = await CAMP_LAYOUT_PREVIEWS.copy_last_year_layout!({}, ctx);
    expect(fresh.blocked).toBeUndefined();
    expect(fresh.sentence).toBe("Start this year's camp layout from 2026's");
  });
});
