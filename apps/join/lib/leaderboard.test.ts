import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  addEntry,
  cleanInitials,
  formatRun,
  parseBoard,
  qualifies,
  type Entry,
} from "./leaderboard";

const e = (name: string, seconds: number): Entry => ({
  name,
  seconds,
  at: `2026-09-25T00:00:${String(seconds).padStart(2, "0")}Z`,
});

describe("speed of chaos leaderboard", () => {
  it("keeps initials to three capitals or digits", () => {
    expect(cleanInitials("jin!n")).toBe("JIN");
    expect(cleanInitials("r2")).toBe("R2");
  });

  it("sorts fastest first and keeps ten", () => {
    let board: Entry[] = [];
    for (let i = 12; i > 0; i--) board = addEntry(board, e("CAT", i * 10));
    expect(board).toHaveLength(BOARD_SIZE);
    expect(board[0]!.seconds).toBe(10);
    expect(board.at(-1)!.seconds).toBe(100);
  });

  it("a run qualifies while the board has room, then only if it beats the slowest", () => {
    const full = Array.from({ length: BOARD_SIZE }, (_, i) => e("CAT", 10 + i));
    expect(qualifies([], 999)).toBe(true);
    // The slowest on the board is 19 s: a tie does not knock it off.
    expect(qualifies(full, 19)).toBe(false);
    expect(qualifies(full, 25)).toBe(false);
    expect(qualifies(full, 18.5)).toBe(true);
  });

  it("formats a time with tenths", () => {
    expect(formatRun(83.47)).toBe("1:23.4");
    expect(formatRun(5)).toBe("0:05.0");
  });

  it("reads a stored board and drops anything broken", () => {
    const raw = JSON.stringify([
      e("zed", 30),
      { name: "BAD", seconds: "fast", at: "x" },
      e("ace", 12),
      null,
    ]);
    expect(parseBoard(raw).map((x) => x.name)).toEqual(["ACE", "ZED"]);
    expect(parseBoard("not json")).toEqual([]);
    expect(parseBoard(null)).toEqual([]);
  });
});
