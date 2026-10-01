import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { liveWindow } from "./console-nav";

// A page in a 404 OS window lays itself out by the WINDOW's width (the kit's
// page-sm/md/lg/xl variants), not the screen's. These helpers resize a
// window on the desktop and check that its page reflowed: nothing runs past
// the window's edge, no heading is squeezed to one word a line, and two
// parts of the page stack or sit side by side as the window's width says.

/** A narrow window: every page-* split is off (under page-sm's 40rem). */
export const NARROW = 470;
/** The Kitchen's and most programs' opening size (880) and a bit: page-md. */
export const WIDE = 900;
/**
 * Wide enough for page-lg (64rem, 1024px): the window's body is the width
 * less its 1px borders and, when the page scrolls, the 10px scrollbar
 * (globals.css), which the container query does not count. So 1040 leaves
 * about 4px; `resizeWindowTo` checks the body really is 1024px or more.
 */
export const WIDEST = 1040;
const PAGE_LG = 1024;

/** Drag a window's right edge until the window is `width` px wide. */
export async function resizeWindowTo(
  page: Page,
  win: Locator,
  width: number,
): Promise<void> {
  // A drag can start a few px short when the page reflows under the pointer
  // (a window that has just navigated); drag again from where it stopped.
  for (let attempt = 0; attempt < 3; attempt++) {
    const box = (await win.boundingBox())!;
    if (Math.round(box.width) === width) break;
    const grip = (await win.locator('[data-grip="e"]').boundingBox())!;
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (width - box.width), y, { steps: 8 });
    await page.mouse.up();
  }
  await expect
    .poll(async () => Math.round((await win.boundingBox())!.width))
    .toBe(width);
  if (width === WIDEST) {
    // A thicker border or scrollbar would quietly take the page under
    // page-lg, and every "side by side" check after this would fail for a
    // reason far from it.
    const body = win.locator("[data-window-body]");
    await expect
      .poll(() => body.evaluate((el) => el.clientWidth), {
        message: `the window's body is under page-lg (${PAGE_LG}px)`,
      })
      .toBeGreaterThanOrEqual(PAGE_LG);
  }
}

/**
 * Open a page's window by its address and wait for its heading: the live
 * window, whatever its title.
 */
export async function openWindow(
  page: Page,
  url: string,
  heading: string | RegExp,
): Promise<Locator> {
  await page.goto(url);
  const win = liveWindow(page);
  await expect(
    win.getByRole("heading", { level: 1, name: heading }),
  ).toBeVisible();
  return win;
}

/**
 * The window's page fits it: its body scrolls only up and down (nothing
 * wider than the window), and no heading or card title is squeezed, the way
 * a title beside a screen-wide layout is: a short one (three words or
 * fewer) on more than one line, or a longer one on a line for every two
 * words.
 */
export async function expectFits(win: Locator): Promise<void> {
  const body = win.locator("[data-window-body]");
  await expect
    .poll(() => body.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeLessThanOrEqual(0);
  const squeezed = await body.evaluate(
    (el, headings) =>
      [...el.querySelectorAll<HTMLElement>(headings)]
        .filter((h) => h.getClientRects().length > 0)
        .flatMap((h) => {
          // The heading's own text, not the boxes around it: a badge or an
          // icon beside the words sits a few px higher or lower than they
          // do and is not a line of its own.
          const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
          const rects: DOMRect[] = [];
          const texts: string[] = [];
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent?.trim()) continue;
            texts.push(n.textContent);
            const range = document.createRange();
            range.selectNodeContents(n);
            rects.push(
              ...[...range.getClientRects()].filter((r) => r.width > 0),
            );
          }
          // Lines are the runs of rects that overlap top to bottom.
          rects.sort((a, b) => a.top - b.top);
          let lines = 0;
          let bottom = -Infinity;
          for (const r of rects) {
            if (r.top >= bottom - 1) lines++;
            bottom = Math.max(bottom, r.bottom);
          }
          const words = texts.join(" ").trim().split(/\s+/).length;
          const tooMany =
            words <= 3 ? lines > 1 : lines >= Math.ceil(words / 2);
          return tooMany ? [`${texts.join(" ").trim()} (${lines} lines)`] : [];
        }),
    'h1, h2, h3, [data-slot="card-title"]',
  );
  expect(squeezed, "headings squeezed onto too many lines").toEqual([]);
}

/** `below` starts under `above` (the page stacked them). */
export async function expectStacked(
  above: Locator,
  below: Locator,
): Promise<void> {
  const a = (await above.boundingBox())!;
  const b = (await below.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 1);
}

/** `right` sits beside `left`, on the same line. */
export async function expectBeside(
  left: Locator,
  right: Locator,
): Promise<void> {
  const l = (await left.boundingBox())!;
  const r = (await right.boundingBox())!;
  expect(r.x).toBeGreaterThanOrEqual(l.x + l.width - 1);
  expect(r.y).toBeLessThan(l.y + l.height);
}

/** The width of an element's top border, in px. */
export function borderTop(el: Locator): Promise<number> {
  return el.evaluate((node) =>
    parseFloat(getComputedStyle(node).borderTopWidth),
  );
}

/**
 * The top border of a ResponsiveDataTable's frame, in px: the frame is drawn
 * on its table form only, so it is 0 whenever the rows show as cards.
 */
export function tableFrameTop(dataTable: Locator): Promise<number> {
  return dataTable
    .locator('[data-rdt-layout="table"]')
    .evaluate((node) =>
      node.getClientRects().length === 0
        ? 0
        : parseFloat(getComputedStyle(node).borderTopWidth),
    );
}

/**
 * No shared data table in the window scrolls sideways: each one either fits
 * as a table or shows its rows as cards (the audit of 2026-10-01 found row
 * buttons past the window's edge behind a hidden sideways scroll), and each
 * visible row action sits inside the window.
 */
export async function expectTablesFit(win: Locator): Promise<void> {
  await expect
    .poll(() =>
      win.evaluate((w) =>
        [
          ...w.querySelectorAll<HTMLElement>(
            '[data-slot="responsive-data-table"] [data-slot="table-container"]',
          ),
        ]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.scrollWidth - el.clientWidth)
          .filter((over) => over > 1),
      ),
    )
    .toEqual([]);
  const right = (await win.boundingBox())!;
  const actions = await win.evaluate((w) =>
    [...w.querySelectorAll<HTMLElement>('[data-slot="row-actions"]')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.getBoundingClientRect().right),
  );
  for (const edge of actions) {
    expect(edge).toBeLessThanOrEqual(right.x + right.width);
  }
}

/**
 * The sticky rail around `inside` sticks near the top of the WINDOW's scroll
 * box (within 24px) while the column beside it scrolls on: the page is
 * scrolled halfway through the room the rail has to travel, and the rail's
 * top is measured against the window's body.
 */
export async function expectSticksInWindow(inside: Locator): Promise<void> {
  const room = await inside.evaluate((el) => {
    let rail: HTMLElement | null = el as HTMLElement;
    while (rail && getComputedStyle(rail).position !== "sticky") {
      rail = rail.parentElement;
    }
    if (!rail) return null;
    const row = rail.parentElement!;
    const scroller = rail.closest<HTMLElement>("[data-window-body]")!;
    const rowTop =
      row.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    const room = row.offsetHeight - rail.offsetHeight;
    scroller.scrollTop = rowTop + room / 2;
    rail.setAttribute("data-sticky-under-test", "");
    return room;
  });
  expect(room, "a sticky rail around it").not.toBeNull();
  expect(room!, "the column beside runs longer than the rail").toBeGreaterThan(
    100,
  );
  const win = inside.locator("xpath=ancestor::*[@data-window-body][1]");
  const rail = win.locator("[data-sticky-under-test]");
  const bodyTop = (await win.boundingBox())!.y;
  const railTop = (await rail.boundingBox())!.y - bodyTop;
  await rail.evaluate((el) => el.removeAttribute("data-sticky-under-test"));
  expect(railTop).toBeGreaterThanOrEqual(0);
  expect(railTop).toBeLessThanOrEqual(24);
}
