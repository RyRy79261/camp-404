import { asc } from "drizzle-orm";
import {
  INKBLOT_BOARD_SIZE,
  InkblotRun,
  type InkblotBoardEntry,
} from "@camp404/types";
import type { DbOrTx } from "./audit";
import { createHttpDb } from "./index";
import * as schema from "./schema";

// INKBLOT's shared board (`inkblot_scores`): every clean sweep a member put
// their initials to, and the fastest INKBLOT_BOARD_SIZE of them read back as
// the camp's board. Only the member writes their own rows, so no audit row.
// Account erasure deletes them (account.ts).

/** The value the write was given is not a run the board accepts. */
export class InkblotRunInvalidError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join(" "));
  }
}

/** The camp's board: the fastest runs, oldest first on a tie. */
export async function getInkblotBoard(
  db: DbOrTx = createHttpDb(),
): Promise<InkblotBoardEntry[]> {
  const rows = await db
    .select({
      id: schema.inkblotScores.id,
      initials: schema.inkblotScores.initials,
      durationMs: schema.inkblotScores.durationMs,
      createdAt: schema.inkblotScores.createdAt,
    })
    .from(schema.inkblotScores)
    .orderBy(
      asc(schema.inkblotScores.durationMs),
      asc(schema.inkblotScores.createdAt),
      asc(schema.inkblotScores.id),
    )
    .limit(INKBLOT_BOARD_SIZE);
  return rows.map((r) => ({
    id: r.id,
    initials: r.initials,
    durationMs: r.durationMs,
    at: r.createdAt.toISOString(),
  }));
}

/**
 * Record a member's run. Checked here as well as at the action, so nothing
 * outside the board's bounds reaches the table. One statement, so the
 * stateless driver does it. Returns the stored row.
 */
export async function recordInkblotRun(
  userId: string,
  run: unknown,
  db: DbOrTx = createHttpDb(),
): Promise<InkblotBoardEntry> {
  const parsed = InkblotRun.safeParse(run);
  if (!parsed.success) {
    throw new InkblotRunInvalidError(
      parsed.error.issues.map((issue) => issue.message),
    );
  }
  const [row] = await db
    .insert(schema.inkblotScores)
    .values({
      userId,
      initials: parsed.data.initials,
      durationMs: parsed.data.durationMs,
    })
    .returning();
  return {
    id: row!.id,
    initials: row!.initials,
    durationMs: row!.durationMs,
    at: row!.createdAt.toISOString(),
  };
}
