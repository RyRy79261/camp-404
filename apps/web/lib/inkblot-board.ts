import "server-only";

import {
  getInkblotBoard as dbGetInkblotBoard,
  recordInkblotRun as dbRecordInkblotRun,
} from "@camp404/db/inkblot";
import type { InkblotBoardEntry, InkblotRun } from "@camp404/types";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// INKBLOT's shared board, from the database or, under E2E, the test store.
// Written through app/(console)/terminal/inkblot/actions.ts.

export async function readInkblotBoard(): Promise<InkblotBoardEntry[]> {
  if (usesTestStore()) return testStore.getInkblotBoard();
  return dbGetInkblotBoard();
}

/** The caller passes the signed-in member's own id, never one from the client. */
export async function recordInkblotRunFor(
  userId: string,
  run: InkblotRun,
): Promise<InkblotBoardEntry> {
  if (usesTestStore()) return testStore.recordInkblotRun(userId, run);
  return dbRecordInkblotRun(userId, run);
}
