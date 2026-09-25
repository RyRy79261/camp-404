import "server-only";

import * as db from "@camp404/db/join-page";
import type {
  JoinPage,
  JoinPageWriteResult,
  PublishedJoinPage,
} from "@camp404/db/join-page";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// The join page (#264), from the database or, under E2E, the test store. The
// rules live in @camp404/db/join-page; the store repeats them. Each write
// re-checks the actor itself, so a caller passes only who is acting.

export type { JoinPage, JoinPageWriteResult, PublishedJoinPage };

/** This year's page for the captain's editor. */
export async function getJoinPageForEditor(): Promise<JoinPage> {
  return usesTestStore()
    ? testStore.getJoinPageForEditor()
    : db.getJoinPageForEditor();
}

/** Save this year's page, and publish it when asked. Captains only. */
export async function saveJoinPage(
  input: Parameters<typeof db.saveJoinPage>[0],
): Promise<JoinPageWriteResult<{ version: number; cycle: number }>> {
  return usesTestStore()
    ? testStore.saveJoinPage(input)
    : db.saveJoinPage(input);
}

/** Take this year's page off the join site. Captains only. */
export async function unpublishJoinPage(
  input: Parameters<typeof db.unpublishJoinPage>[0],
): Promise<JoinPageWriteResult<{ version: number }>> {
  return usesTestStore()
    ? testStore.unpublishJoinPage(input)
    : db.unpublishJoinPage(input);
}
