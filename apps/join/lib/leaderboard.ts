// INKBLOT.EXE's "speed of chaos" leaderboard: the ten fastest clean sweeps.
// The site has no database, so it lives in each visitor's browser
// (localStorage). A shared board would need the main app.

export const BOARD_SIZE = 10;
export const BOARD_KEY = "inkblot.leaderboard.v1";

export type Entry = { name: string; seconds: number; at: string };

/** Three letters or digits, upper case, like an arcade cabinet. */
export function cleanInitials(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
}

/** Would this time make the board? */
export function qualifies(board: readonly Entry[], seconds: number): boolean {
  return (
    board.length < BOARD_SIZE || seconds < board[board.length - 1]!.seconds
  );
}

/** The board with this run added, fastest first, cut to BOARD_SIZE. */
export function addEntry(board: readonly Entry[], entry: Entry): Entry[] {
  return [...board, entry]
    .sort((a, b) => a.seconds - b.seconds || a.at.localeCompare(b.at))
    .slice(0, BOARD_SIZE);
}

/** m:ss.t, the way the board shows a time. */
export function formatRun(seconds: number): string {
  const tenths = Math.floor(seconds * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${tenths % 10}`;
}

/** Read a stored board, dropping anything that is not a valid entry. */
export function parseBoard(raw: string | null): Entry[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const entries = data.filter(
      (e): e is Entry =>
        typeof e === "object" &&
        e !== null &&
        typeof e.name === "string" &&
        typeof e.seconds === "number" &&
        Number.isFinite(e.seconds) &&
        e.seconds > 0 &&
        typeof e.at === "string",
    );
    return entries
      .map((e) => ({
        name: cleanInitials(e.name) || "???",
        seconds: e.seconds,
        at: e.at,
      }))
      .sort((a, b) => a.seconds - b.seconds)
      .slice(0, BOARD_SIZE);
  } catch {
    return [];
  }
}

export function loadBoard(): Entry[] {
  try {
    return parseBoard(window.localStorage.getItem(BOARD_KEY));
  } catch {
    return [];
  }
}

export function saveBoard(board: readonly Entry[]) {
  try {
    window.localStorage.setItem(BOARD_KEY, JSON.stringify(board));
  } catch {
    // Private browsing or storage full: the board just does not persist.
  }
}
