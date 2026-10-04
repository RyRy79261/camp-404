import "server-only";

import {
  SEARCH_LIMIT_PER_KIND,
  searchWords,
  type SearchEntryRow,
  type SearchRef,
  type SearchViewer,
} from "@camp404/db/search";
import { testStore } from "./test-store";
import { guideTestStore } from "./test-store-guide";
import { inventoryStore } from "./test-store-inventory";
import { rentalTestStore } from "./test-store-rental";
import { shiftsTestStore } from "./test-store-shifts";

// Twin of @camp404/db/search for E2E (#326, step 2): the same kinds and the
// same page rules over the in-memory stores, so Playwright can drive Ctrl+K.
// The questionnaire builder has no twin (its definitions are not kept under
// E2E), so questionnaires are never found here.

const blank = {
  team: null,
  at: null,
  num: null,
  num2: null,
  label: null,
  extra: null,
  ref: null,
  flag: false,
};

function candidates(viewer: SearchViewer, now: Date): SearchEntryRow[] {
  const { cycle, rows } = testStore.searchCandidates({ ...viewer, now });
  for (const c of guideTestStore.listPublishedChapters()) {
    rows.push({
      ...blank,
      kind: "chapter",
      id: c.id,
      title: c.title,
      team: c.team,
      label: c.kind,
      extra: c.category,
      ref: c.slug,
    });
  }
  for (const i of inventoryStore.listInventoryItems()) {
    if (i.archivedAt) continue;
    rows.push({
      ...blank,
      kind: "inventory",
      id: i.id,
      title: i.name,
      team: i.team,
      num: i.quantity,
      label: i.location,
      extra: i.unit,
    });
  }
  for (const t of shiftsTestStore.readShiftRoster(cycle).types) {
    rows.push({
      ...blank,
      kind: "shift",
      id: t.id,
      title: t.name,
      team: t.team,
      num: t.startMinute,
      num2: t.durationMinutes,
    });
  }
  for (const g of rentalTestStore.listRentalItems(cycle)) {
    rows.push({
      ...blank,
      kind: "gear",
      id: g.id,
      title: g.name,
      num: g.sleeps,
      flag: g.isTent,
    });
  }
  return rows;
}

export function testSearchEntries(input: {
  viewer: SearchViewer;
  query: string;
  now?: Date;
}): SearchEntryRow[] {
  const words = searchWords(input.query);
  if (words.length === 0) return [];
  const first = words[0]!;
  const matched = candidates(input.viewer, input.now ?? new Date())
    .filter((r) => {
      const title = r.title.toLowerCase();
      return words.every((w) => title.includes(w));
    })
    .sort(
      (a, b) =>
        a.title.toLowerCase().indexOf(first) -
          b.title.toLowerCase().indexOf(first) ||
        a.title.length - b.title.length ||
        (b.at ?? 0) - (a.at ?? 0),
    );
  const perKind = new Map<string, number>();
  return matched.filter((r) => {
    const n = (perKind.get(r.kind) ?? 0) + 1;
    perKind.set(r.kind, n);
    return n <= SEARCH_LIMIT_PER_KIND;
  });
}

export function testResolveEntries(input: {
  viewer: SearchViewer;
  refs: readonly SearchRef[];
  now?: Date;
}): SearchEntryRow[] {
  const wanted = new Set(input.refs.map((r) => `${r.kind}:${r.id}`));
  return candidates(input.viewer, input.now ?? new Date()).filter((r) =>
    wanted.has(`${r.kind}:${r.id}`),
  );
}
