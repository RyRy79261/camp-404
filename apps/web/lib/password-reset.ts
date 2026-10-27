import "server-only";

import * as db from "@camp404/db/password-reset";
import { testStore } from "./test-store";
import { twin } from "./twin";

// A captain's "Send password reset link" (owner's mock-up, step 7): the check
// and the audit row, from the database or, under E2E, the test store. The
// email itself is Better Auth's, sent by the action after this commits.

const resets = twin(db, testStore, ["recordPasswordResetLink"]);

/** Check a captain may send the link, and write its audit row first. */
export const recordPasswordResetLink = resets.recordPasswordResetLink;
