// Sharing a generator with a neighbouring camp (#257). Pure: no DB, no
// session, no next/*. The fuel is split by each camp's share of the energy
// the generator delivers (kWh), proposed here and editable by the team. No
// money: how the other camp pays for its share is agreed outside the app; the
// app records litres only.

export interface FuelSplit {
  /** Our share, in percent, to one decimal place. */
  ourPct: number;
  /** Theirs; the two always add up to 100. */
  theirPct: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Each camp's share of the fuel from its share of the energy. Their share is
 * rounded to one place and ours is the rest, so the two add up to exactly
 * 100. With no energy on either side, it is all ours.
 */
export function fuelSplit(ourWh: number, theirWh: number): FuelSplit {
  const ours = Math.max(0, ourWh);
  const theirs = Math.max(0, theirWh);
  const total = ours + theirs;
  if (total <= 0) return { ourPct: 100, theirPct: 0 };
  const theirPct = round1((theirs / total) * 100);
  return { ourPct: round1(100 - theirPct), theirPct };
}

/** A split the team set by hand: their percent, and ours the rest. */
export function fixedSplit(theirPct: number): FuelSplit {
  const theirs = round1(Math.min(100, Math.max(0, theirPct)));
  return { ourPct: round1(100 - theirs), theirPct: theirs };
}

/** Litres for each camp, from the litres for the burn and the split. */
export function splitLitres(
  litres: number,
  split: FuelSplit,
): { ours: number; theirs: number } {
  const theirs = (litres * split.theirPct) / 100;
  return { ours: litres - theirs, theirs };
}
