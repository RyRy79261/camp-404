// The order pinned announcements sit in, as one pure function.
//
// The owner's ruling (2026-09-22): "Captain 1 gets priority if there's a date
// conflict but otherwise they just go by whatever's latest." So:
//
//   1. Newest PINNED first — the pin's own timestamp, not the announcement's
//      publish time. Re-pinning an old announcement is how a captain brings
//      something back to the front, and ordering by `published_at` would bury
//      it under newer pins no matter how recently it was pinned.
//   2. On a tie, a captain's pin sits above a team lead's. A captain speaks for
//      the camp; a lead speaks for one team.
//   3. On a tie in BOTH, the pin's id breaks it.
//
// Rule 3 is not decoration. The reader must never see two pins swap places
// between renders, so the comparison has to be TOTAL: every pair has a definite
// winner, and no two distinct pins ever compare equal. Timestamps tie more
// often than they look like they would (two pins in the same request, a fixed
// clock in a test, a database that stores milliseconds), and without a final
// tiebreak the sort would be at the mercy of the row order the query happened
// to return.

/** What the order needs to know about a pin. */
export interface PinnedOrder {
  /** The pin's own id — the final, total tiebreak. */
  id: string;
  /** When it was pinned. */
  pinnedAt: Date;
  /**
   * Whether a captain set it. A pin whose setter has since been deleted (the
   * `pinned_by` foreign key is `set null`) counts as NOT a captain's: the
   * claim is unprovable, so the order does not make it.
   */
  pinnedByCaptain: boolean;
}

/**
 * Compare two pins for display order: the one that sorts first goes on top.
 *
 * Total and antisymmetric — distinct pins never compare equal, so the result
 * does not depend on the order the rows arrived in.
 */
export function comparePinned(a: PinnedOrder, b: PinnedOrder): number {
  const byTime = b.pinnedAt.getTime() - a.pinnedAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.pinnedByCaptain !== b.pinnedByCaptain) {
    return a.pinnedByCaptain ? -1 : 1;
  }
  // Ids are unique, so this decides every remaining pair.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The same pins, newest pinned first, captain's pin above a lead's on a tie. */
export function sortPinned<T extends PinnedOrder>(pins: readonly T[]): T[] {
  return [...pins].sort(comparePinned);
}
