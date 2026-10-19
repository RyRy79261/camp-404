import "server-only";

import * as db from "@camp404/db/search";
import type { SearchRef, SearchViewer } from "@camp404/db/search";
import { getTeamsConfig } from "./camp-config";
import type { SearchEntry } from "./program-search";
import { presentEntry } from "./search-entries";
import { testResolveEntries, testSearchEntries } from "./test-store-search";
import { twin } from "./twin";

// Ctrl+K's camp entries (#326, step 2), from the database or, under E2E, the
// test store, picked once (twin). The rules live in @camp404/db/search; the
// store repeats them.
// Rows become what the box shows (a detail line and an address) here, with
// the camp's own team names.

const entries = twin(
  db,
  { searchEntries: testSearchEntries, resolveEntries: testResolveEntries },
  ["searchEntries", "resolveEntries"],
);

async function teamLabels(): Promise<Record<string, string>> {
  const config = await getTeamsConfig();
  return Object.fromEntries(config.teams.map((t) => [t.key, t.label]));
}

/**
 * The entries whose title holds every word of `query`, then (#350) those
 * whose text does, each with only its short line (never the text).
 */
export async function searchCamp(
  viewer: SearchViewer,
  query: string,
): Promise<SearchEntry[]> {
  const [rows, labels] = await Promise.all([
    entries.searchEntries({ viewer, query }),
    teamLabels(),
  ]);
  return rows.map((row) => presentEntry(row, labels));
}

/** Recent entries, looked up again; the ones `viewer` may not open are gone. */
export async function resolveRecent(
  viewer: SearchViewer,
  refs: readonly SearchRef[],
): Promise<SearchEntry[]> {
  const [rows, labels] = await Promise.all([
    entries.resolveEntries({ viewer, refs }),
    teamLabels(),
  ]);
  return rows.map((row) => presentEntry(row, labels));
}
