// Spoken names are heard, not read: "Gecko" and "Gekko" sound the same, and
// Whisper writes whichever it likes. So when voice is about to act on a
// person, the server asks itself whether someone else on the roster could be
// the one the captain meant (#356, "no mistakes": two people who could fit
// always get the two-choice question, never the closer match). Pure, so the
// rule is tested on its own.

/** Lower case, accents off, letters and spaces only. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Optimal string alignment distance (a swap of two letters is one edit). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[a.length]![b.length]!;
}

/** The sound of a word, roughly: the letters that spell the same sound folded. */
function sound(word: string): string {
  return word
    .replace(/ph/g, "f")
    .replace(/ck|c(?=[aou])|q|x/g, "k")
    .replace(/c/g, "s")
    .replace(/z/g, "s")
    .replace(/y/g, "i")
    .replace(/w/g, "v")
    .replace(/h/g, "")
    .replace(/(.)\1+/g, "$1");
}

/** Two words a listener could not tell apart. */
export function soundsAlike(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (sound(a) === sound(b)) return true;
  const longest = Math.max(a.length, b.length);
  // One letter off in a word of five or more ("Gecko"/"Gekko", "Thandi"/"Thandie").
  return longest >= 5 && editDistance(a, b) <= 1;
}

function words(name: string): string[] {
  return normalizeName(name).split(" ").filter(Boolean);
}

/** Two whole names a listener could take for each other. */
export function namesAlike(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 || wb.length === 0) return false;
  if (wa.length !== wb.length) {
    // "Gecko" and "Gecko Naidoo": alike only if the shorter is the start.
    const [short, long] = wa.length < wb.length ? [wa, wb] : [wb, wa];
    return short.every((w, i) => soundsAlike(w, long[i]!));
  }
  return wa.every((w, i) => soundsAlike(w, wb[i]!));
}

/** Whether `heard` holds a word that sounds like `word`. */
function heardWord(heard: readonly string[], word: string): boolean {
  return heard.some((h) => soundsAlike(h, word));
}

/**
 * The people on the roster, other than `target`, whom the captain could have
 * meant when they said `spoken`:
 *  - anyone whose whole name sounds like the target's ("Gecko Naidoo" and
 *    "Gekko Naidoo"), always;
 *  - anyone who shares the target's first name by sound, unless the captain
 *    also said the target's surname (and not theirs).
 * Never the captain themselves when they spoke of themselves.
 */
export function lookAlikes<T extends { id: string; name: string }>(
  target: T,
  roster: readonly T[],
  spoken: string,
): T[] {
  const heard = words(spoken);
  const tw = words(target.name);
  return roster.filter((other) => {
    if (other.id === target.id) return false;
    if (namesAlike(other.name, target.name) && words(other.name).length === tw.length) {
      return true;
    }
    const ow = words(other.name);
    if (!tw[0] || !ow[0] || !soundsAlike(tw[0], ow[0])) return false;
    const targetRest = tw.slice(1);
    const otherRest = ow.slice(1);
    const saidTarget =
      targetRest.length > 0 && targetRest.every((w) => heardWord(heard, w));
    const saidOther =
      otherRest.length > 0 && otherRest.every((w) => heardWord(heard, w));
    if (saidTarget && !saidOther) return false;
    return true;
  });
}

/**
 * Whether the words single out one claim among a person's waiting claims: a
 * word of four letters or more from its description that no other one has,
 * or its amount in whole rands.
 */
export function wordsSingleOut(
  spoken: string,
  claim: { description: string; amountCents: number },
  others: readonly { description: string; amountCents: number }[],
): boolean {
  const heard = words(spoken);
  const mine = words(claim.description).filter((w) => w.length >= 4);
  const theirs = new Set(others.flatMap((o) => words(o.description)));
  if (mine.some((w) => !theirs.has(w) && heardWord(heard, w))) return true;
  const digits = spoken.replace(/[\s,]/g, "");
  const rands = Math.floor(claim.amountCents / 100);
  const sameAmount = others.some(
    (o) => Math.floor(o.amountCents / 100) === rands,
  );
  return !sameAmount && new RegExp(`(^|\\D)${rands}(\\D|$)`).test(digits);
}
