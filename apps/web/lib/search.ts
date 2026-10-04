import "server-only";

import {
  resolveEntries as dbResolveEntries,
  searchEntries as dbSearchEntries,
  type SearchRef,
  type SearchViewer,
} from "@camp404/db/search";
import { getTeamsConfig } from "./camp-config";
import type { SearchEntry } from "./program-search";
import { presentEntry } from "./search-entries";
import { usesTestStore } from "./test-mode";
import { testResolveEntries, testSearchEntries } from "./test-store-search";

// Ctrl+K's camp entries (#326, step 2), from the database or, under E2E, the
// test store. The rules live in @camp404/db/search; the store repeats them.
// Rows become what the box shows (a detail line and an address) here, with
// the camp's own team names.

async function teamLabels(): Promise<Record<string, string>> {
  const config = await getTeamsConfig();
  return Object.fromEntries(config.teams.map((t) => [t.key, t.label]));
}

/** The entries whose title holds every word of `query`. */
export async function searchCamp(
  viewer: SearchViewer,
  query: string,
): Promise<SearchEntry[]> {
  const [rows, labels] = await Promise.all([
    usesTestStore()
      ? testSearchEntries({ viewer, query })
      : dbSearchEntries({ viewer, query }),
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
    usesTestStore()
      ? testResolveEntries({ viewer, refs })
      : dbResolveEntries({ viewer, refs }),
    teamLabels(),
  ]);
  return rows.map((row) => presentEntry(row, labels));
}
