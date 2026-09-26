import type { KeyboardEvent } from "react";

// Focus helpers for the OS's modal pieces (the blocking layer, the folder-name
// dialog): where focus starts, and Tab that never leaves.

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

/**
 * The tab stops inside `root`, in document order, skipping hidden ones and
 * any taken out of the Tab order (`tabindex="-1"`: a dialog's × for the
 * pointer, whose keyboard way is Esc).
 */
export function tabStops(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      el.getAttribute("tabindex") !== "-1" && !el.closest("[hidden],[inert]"),
  );
}

/**
 * Put focus where a modal wants it first: an element marked
 * `data-autofocus`, else the first field, else the first tab stop, else the
 * root itself.
 */
export function focusFirst(root: HTMLElement): void {
  const target =
    root.querySelector<HTMLElement>("[data-autofocus]") ??
    tabStops(root).find((el) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) ??
    tabStops(root)[0] ??
    root;
  target.focus({ preventScroll: true });
}

/**
 * Keep Tab inside `root`: from the last stop back to the first, and the other
 * way with Shift. A key pressed in a portalled overlay (the form's own Select,
 * whose events React still bubbles through `root`) is left to that overlay.
 */
export function trapTab(e: KeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== "Tab" || !root) return;
  if (!(e.target instanceof Node) || !root.contains(e.target)) return;
  const stops = tabStops(root);
  if (stops.length === 0) {
    e.preventDefault();
    root.focus();
    return;
  }
  const first = stops[0]!;
  const last = stops.at(-1)!;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
