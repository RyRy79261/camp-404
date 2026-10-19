// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INKBLOT_BOARD_SIZE,
  INKBLOT_MIN_DURATION_MS,
  OS_THEMES,
  defaultDesktopPreferences,
} from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// A member's own 404 OS state, through lib/desktop-preferences.ts,
// lib/desktop-layout.ts and lib/inkblot-board.ts, on the database and on the
// E2E store: display preferences, the desktop layout and INKBLOT's shared
// board, each checked the same way on both sides (the Zod schemas in
// @camp404/types). Every write is the member's own; the caller passes their
// id. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  markWelcomeSeenFor,
  saveDesktopPreferencesFor,
} from "../desktop-preferences";
import { saveDesktopLayoutFor } from "../desktop-layout";
import { readInkblotBoard, recordInkblotRunFor } from "../inkblot-board";

const [, CALM] = OS_THEMES;

/** The class of what a write threw (these errors keep the name "Error"). */
async function thrown(work: () => Promise<unknown>): Promise<string | null> {
  try {
    await work();
    return null;
  } catch (error) {
    return (error as Error).constructor.name;
  }
}

describe("a member's desktop: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("saves display choices and the layout, and refuses what is not one", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const theme = await saveDesktopPreferencesFor(p.member, {
        theme: CALM,
      });
      const bigger = await saveDesktopPreferencesFor(p.member, {
        biggerText: true,
      });
      const bad = await thrown(() =>
        saveDesktopPreferencesFor(p.member, { theme: "neon" }),
      );
      const sneaky = await thrown(() =>
        saveDesktopPreferencesFor(p.member, { welcomeSeenAt: null }),
      );
      const seen = await markWelcomeSeenFor(p.other);
      const layout = await saveDesktopLayoutFor(p.member, {
        cells: { inbox: { c: 1, r: 2 } },
        items: [],
      });
      const badLayout = await thrown(() =>
        saveDesktopLayoutFor(p.member, { cells: "everywhere" }),
      );
      return {
        theme,
        bigger,
        bad,
        sneaky,
        seen: { ...seen, welcomeSeenAt: seen.welcomeSeenAt !== null },
        layout,
        badLayout,
      };
    });
    expect(db).toMatchObject({
      theme: { ...defaultDesktopPreferences(), theme: CALM },
      bigger: { theme: CALM, biggerText: true },
      bad: "DesktopPreferencesInvalidError",
      seen: { welcomeSeenAt: true },
      layout: { cells: { inbox: { c: 1, r: 2 } }, items: [] },
      badLayout: "DesktopLayoutInvalidError",
    });
    expect(store).toEqual(db);
  });

  it("keeps INKBLOT's fastest runs, fastest first, and refuses a run that cannot be real", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const runs = [
        { initials: "NOV", durationMs: INKBLOT_MIN_DURATION_MS + 3000 },
        { initials: "ZED", durationMs: INKBLOT_MIN_DURATION_MS + 1000 },
        { initials: "CAP", durationMs: INKBLOT_MIN_DURATION_MS + 2000 },
      ];
      const saved = [];
      for (const [n, run] of runs.entries()) {
        saved.push(
          await recordInkblotRunFor(n === 1 ? p.other : p.member, run),
        );
      }
      const tooFast = await thrown(() =>
        recordInkblotRunFor(p.member, { initials: "NOV", durationMs: 1 }),
      );
      const board = await readInkblotBoard();
      return {
        saved: saved.map((r) => r.initials),
        tooFast,
        board: board.map((r) => ({ initials: r.initials, ms: r.durationMs })),
        fits: board.length <= INKBLOT_BOARD_SIZE,
      };
    });
    expect(db).toEqual({
      saved: ["NOV", "ZED", "CAP"],
      tooFast: "InkblotRunInvalidError",
      board: [
        { initials: "ZED", ms: INKBLOT_MIN_DURATION_MS + 1000 },
        { initials: "CAP", ms: INKBLOT_MIN_DURATION_MS + 2000 },
        { initials: "NOV", ms: INKBLOT_MIN_DURATION_MS + 3000 },
      ],
      fits: true,
    });
    expect(store).toEqual(db);
  });
});
