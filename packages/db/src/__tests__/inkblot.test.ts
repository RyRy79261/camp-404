import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { INKBLOT_BOARD_SIZE } from "@camp404/types";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { sanitiseAccount } from "../account";
import {
  InkblotRunInvalidError,
  getInkblotBoard,
  recordInkblotRun,
} from "../inkblot";
import * as schema from "../schema";

// INKBLOT's shared board against real Postgres: every member's runs on one
// board, fastest first and cut to size, the bounds held by the write and by
// the table, and a member's runs gone with their erased account.

describe("inkblot board", () => {
  const h = useTestDb();

  it("is empty before anyone plays", async () => {
    expect(await getInkblotBoard()).toEqual([]);
  });

  it("puts every member's runs on one board, fastest first", async () => {
    const a = await makeUser(h.db());
    const b = await makeUser(h.db());
    await recordInkblotRun(a.id, { initials: "AAA", durationMs: 30_000 });
    await recordInkblotRun(b.id, { initials: "BB", durationMs: 12_500 });
    await recordInkblotRun(a.id, { initials: "???", durationMs: 20_000 });

    const board = await getInkblotBoard();
    expect(board.map((e) => [e.initials, e.durationMs])).toEqual([
      ["BB", 12_500],
      ["???", 20_000],
      ["AAA", 30_000],
    ]);
  });

  it("shows only the fastest runs, the earlier one first on a tie", async () => {
    const member = await makeUser(h.db());
    for (let i = 0; i < INKBLOT_BOARD_SIZE + 3; i++) {
      await recordInkblotRun(member.id, {
        initials: "SLO",
        durationMs: 50_000 + i * 1000,
      });
    }
    const first = await recordInkblotRun(member.id, {
      initials: "TIE",
      durationMs: 10_000,
    });
    await h
      .db()
      .update(schema.inkblotScores)
      .set({ createdAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(schema.inkblotScores.id, first.id));
    await recordInkblotRun(member.id, { initials: "TOO", durationMs: 10_000 });

    const board = await getInkblotBoard();
    expect(board).toHaveLength(INKBLOT_BOARD_SIZE);
    expect(board[0]!.initials).toBe("TIE");
    expect(board[1]!.initials).toBe("TOO");
    expect(board.at(-1)!.durationMs).toBe(57_000);
  });

  it("returns the stored row, so the game can mark the member's own", async () => {
    const member = await makeUser(h.db());
    const mine = await recordInkblotRun(member.id, {
      initials: "ME",
      durationMs: 15_000,
    });
    expect((await getInkblotBoard())[0]).toEqual(mine);
  });

  it.each([
    ["too fast to be real", { initials: "ZAP", durationMs: 7_999 }],
    ["over an hour", { initials: "ZZZ", durationMs: 3_600_001 }],
    ["a fraction of a millisecond", { initials: "ABC", durationMs: 9000.5 }],
    ["lower-case initials", { initials: "abc", durationMs: 9000 }],
    ["four initials", { initials: "ABCD", durationMs: 9000 }],
    ["no initials", { initials: "", durationMs: 9000 }],
    ["a stray field", { initials: "ABC", durationMs: 9000, userId: "x" }],
  ])("refuses a run %s and writes nothing", async (_, run) => {
    const member = await makeUser(h.db());
    await expect(recordInkblotRun(member.id, run)).rejects.toBeInstanceOf(
      InkblotRunInvalidError,
    );
    expect(await getInkblotBoard()).toEqual([]);
  });

  it("the table itself refuses a time or initials past the write's check", async () => {
    const member = await makeUser(h.db());
    await expect(
      h
        .db()
        .execute(
          sql`insert into inkblot_scores (user_id, initials, duration_ms) values (${member.id}, 'ABC', 100)`,
        ),
    ).rejects.toThrow();
    await expect(
      h
        .db()
        .execute(
          sql`insert into inkblot_scores (user_id, initials, duration_ms) values (${member.id}, 'abcd', 9000)`,
        ),
    ).rejects.toThrow();
  });

  it("erasure deletes the member's runs and keeps everyone else's", async () => {
    const member = await makeUser(h.db());
    const other = await makeUser(h.db());
    await recordInkblotRun(member.id, { initials: "GON", durationMs: 9_000 });
    await recordInkblotRun(other.id, { initials: "KEP", durationMs: 11_000 });

    const result = await sanitiseAccount(member.id);
    expect(result.ok).toBe(true);

    expect((await getInkblotBoard()).map((e) => e.initials)).toEqual(["KEP"]);
  });
});
