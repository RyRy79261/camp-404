/**
 * INKBLOT.EXE's words, from the app that shows it (Join's lib/content.ts), so
 * the game reads no app's content itself.
 */
export type InkblotCopy = {
  /** The window's name and the title card's heading. */
  title: string;
  tagline: string;
  /** The keys, on a keyboard; the touch line on a narrow screen. */
  controls: string;
  touch: string;
  start: string;
  winTitle: string;
  winLine: string;
  boardNote: string;
  againButton: string;
};
