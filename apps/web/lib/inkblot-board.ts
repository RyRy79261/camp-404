import "server-only";

import * as db from "@camp404/db/inkblot";
import { testStore } from "./test-store";
import { twin } from "./twin";

// INKBLOT's shared board, from the database or, under E2E, the test store,
// picked once (twin); lib/__tests__/desktop-agreement.test.ts holds the two
// sides equal. Written through app/(console)/terminal/inkblot/actions.ts.

const board = twin(db, testStore, ["getInkblotBoard", "recordInkblotRun"]);

export const readInkblotBoard = board.getInkblotBoard;

/** The caller passes the signed-in member's own id, never one from the client. */
export const recordInkblotRunFor = board.recordInkblotRun;
