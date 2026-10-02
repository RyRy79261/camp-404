// Scroll a 404 OS window's own body so an element sits at its top, and touch
// nothing else. Element.scrollIntoView scrolls every scrollable ancestor, the
// desktop included, which slid the whole screen under the taskbar. Outside a
// window (a page on its own) it falls back to scrollIntoView.

export function scrollInWindow(
  el: HTMLElement | null,
  { onlyUp = false }: { onlyUp?: boolean } = {},
): void {
  if (!el) return;
  const body = el.closest<HTMLElement>("[data-window-body]");
  if (!body) {
    el.scrollIntoView?.({ block: "start" });
    return;
  }
  const top =
    el.getBoundingClientRect().top -
    body.getBoundingClientRect().top +
    body.scrollTop -
    16;
  if (onlyUp && body.scrollTop <= top) return;
  body.scrollTop = Math.max(0, top);
}
