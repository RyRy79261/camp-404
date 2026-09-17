// How many of an announcement's recipients have seen it, for the captain's
// published list. Ported from the AfrikaBurn contributors app.

export interface ReadRate {
  /** Recipients who have seen it, never more than `of`. */
  read: number;
  of: number;
  /** Whole percent, 0 when there are no recipients. */
  percent: number;
}

/**
 * Clamp a seen count into [0, of], so a count read a moment apart from the
 * recipient count can never show more than everyone, or less than no one.
 */
export function readRate(read: number, of: number): ReadRate {
  const total = Math.max(0, Math.floor(of));
  const seen = Math.min(Math.max(0, Math.floor(read)), total);
  return {
    read: seen,
    of: total,
    percent: total === 0 ? 0 : Math.round((seen / total) * 100),
  };
}
