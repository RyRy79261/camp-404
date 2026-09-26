import { expect, type Locator, type Page } from "@playwright/test";

// The console is the 404 OS desktop (PR C). Its "nav" is the Start menu on a
// desktop (groups Me, Camp, Captains and My teams, some rows opening a folder
// window: Teams, Kitchen, Captains) and the home screen below `md` (the same
// groups as rows of big icons, folders opening as full-screen sheets). These
// helpers hide the difference, so a spec reads the same on chromium and on
// mobile-360.
//
// A "place" is a Start menu group or a folder. A folder wins where a name is
// both ("Captains" is a group AND the folder in it): the folder is where the
// captain programs are.

/** Tailwind's `md`: below it the desktop is the phone's home screen. */
const PHONE_BELOW = 768;

export function usesPhoneLayout(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < PHONE_BELOW;
}

/** Kept for older callers: the phone layout is the old "nav sheet" width. */
export const usesNavSheet = usesPhoneLayout;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A program's or folder's accessible name: its plain name, maybe after
 * "Open " (an icon in a folder window), maybe followed by ", 3 new" or ",
 * you lead it".
 */
export function entryName(name: string): RegExp {
  return new RegExp(`^(Open )?${escapeRegExp(name)}(, .*)?$`);
}

/** The taskbar along the bottom of the desktop. */
export function taskbar(page: Page): Locator {
  return page.getByRole("toolbar", { name: "Taskbar" });
}

/** The phone's bottom bar. */
export function bottomBar(page: Page): Locator {
  return page.getByRole("toolbar", { name: "Bottom bar" });
}

/** The Start menu, once open. */
export function startMenu(page: Page): Locator {
  return page.getByRole("menu", { name: "Start", exact: true });
}

/** The Start button on the taskbar. */
export function startButton(page: Page): Locator {
  return taskbar(page).getByRole("button", { name: "Start", exact: true });
}

/** The desktop's icon grid (desktop only; the phone has its home screen). */
export function desktopIcons(page: Page): Locator {
  return page.getByRole("listbox", { name: "Desktop", exact: true });
}

/** One icon on the desktop, by its plain name. */
export function desktopIcon(page: Page, name: string): Locator {
  return desktopIcons(page).getByRole("option", { name: entryName(name) });
}

/** The phone's home screen. */
export function homeScreen(page: Page): Locator {
  return page.locator("[data-os-phone-home]");
}

/**
 * A window on the desktop, by its title, live or not. The live one (and a
 * folder) is a labelled region; a background copy is hidden from assistive
 * tech, so it is found by the title the frame carries.
 */
export function osWindow(page: Page, title: string): Locator {
  return page.locator(
    `section[data-window][data-window-title=${JSON.stringify(title)}]`,
  );
}

/** The window whose page is live (the focused one), whatever its title. */
export function liveWindow(page: Page): Locator {
  return page.locator("section[data-window]:has(#os-window-content)");
}

/** A window's button on the taskbar ("Roster window"). */
export function taskbarWindow(page: Page, title: string): Locator {
  return taskbar(page).getByRole("button", {
    name: `${title} window`,
    exact: true,
  });
}

/**
 * The signed-in desktop at `/` has painted: its (visually hidden) h1 is in
 * the page. Something PRESENT, to assert before any absence.
 */
export async function expectDesktop(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 1, name: "Desktop", exact: true }),
  ).toBeAttached();
  if (usesPhoneLayout(page)) {
    await expect(homeScreen(page)).toBeVisible();
  } else {
    await expect(startButton(page)).toBeVisible();
  }
}

/**
 * Open the Today gadget (the member's own summary: to-dos, tasks, coming up,
 * lift, checklist) and return it. On a desktop it is the panel behind the
 * right-edge handle; on a phone, the bottom bar's Today sheet. Its body is
 * the `/` page, so the page must be `/` (the phone goes home first itself).
 */
export async function openToday(page: Page): Promise<Locator> {
  if (usesPhoneLayout(page)) {
    await bottomBar(page)
      .getByRole("button", { name: /^Today(, \d+ due)?$/ })
      .click();
    const sheet = page.getByRole("region", { name: "Today", exact: true });
    await expect(sheet).toBeVisible();
    return sheet;
  }
  const panel = page.getByRole("complementary", { name: "Today", exact: true });
  const handle = page.getByRole("button", { name: /^(Show|Hide) Today/ });
  await expect(handle).toBeVisible();
  // The open or closed choice is kept in this browser, and the server paints
  // it closed: read before hydration, a stored "open" looks closed, and a
  // click then shuts it. So open it until it stays open.
  await expect(async () => {
    if (!(await panel.isVisible())) await handle.click();
    await expect(panel).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return panel;
}

/** A window on screen: on a phone, the one full-screen window over home. */
function shownWindows(page: Page): Locator {
  return page.locator("section[data-window]").filter({ visible: true });
}

/**
 * On a phone, back to the home screen (the bottom bar's Home). The home
 * screen is always drawn, under whatever window is open, so "home" means no
 * window on screen.
 */
export async function goHome(page: Page): Promise<void> {
  await bottomBar(page).getByRole("button", { name: "Home" }).click();
  await expect(shownWindows(page)).toHaveCount(0);
  await expect(homeScreen(page)).toBeVisible();
}

/**
 * Open the part of the nav that holds `place` and return it: a Start menu
 * group ("Me", "Camp", "My teams") or a folder's window ("Teams", "Kitchen",
 * "Captains", "Kitchen team"). With no place, the whole Start menu, or the
 * home screen. Entries inside are found with {@link navEntry}.
 */
export async function openConsoleNav(
  page: Page,
  place?: string,
): Promise<Locator> {
  if (usesPhoneLayout(page)) {
    if ((await shownWindows(page).count()) > 0) await goHome(page);
    const home = homeScreen(page);
    await expect(home).toBeVisible();
    if (!place) return home;
    const folder = home.getByRole("button", { name: entryName(place) });
    if ((await folder.count()) > 0) {
      await folder.first().click();
      return folderList(page, place);
    }
    const group = home.getByRole("navigation", { name: place, exact: true });
    await expect(group).toBeVisible();
    return group;
  }

  const menu = startMenu(page);
  if (!(await menu.isVisible())) await startButton(page).click();
  await expect(menu).toBeVisible();
  if (!place) return menu;
  // A folder row is named exactly by the folder (a team folder a member
  // leads adds ", you lead it").
  const folder = menu.getByRole("menuitem", { name: entryName(place) });
  const isFolder = await folder.evaluateAll((rows) =>
    rows.some((row) => row.tagName === "BUTTON"),
  );
  if (isFolder) {
    await menu
      .locator("button[role=menuitem]")
      .and(menu.getByRole("menuitem", { name: entryName(place) }))
      .first()
      .click();
    return folderList(page, place);
  }
  const group = menu.getByRole("group", { name: place, exact: true });
  await expect(group).toBeVisible();
  return group;
}

/** A folder window's list of programs, once it has opened. */
async function folderList(page: Page, folder: string): Promise<Locator> {
  const list = page
    .locator("section[data-window]")
    .getByRole("list", { name: folder, exact: true });
  await expect(list).toBeVisible();
  return list;
}

/**
 * One entry in what `openConsoleNav` returned: a Start menu row, a folder's
 * icon ("Open Roster"), or a home-screen icon.
 */
export function navEntry(container: Locator, name: string): Locator {
  const n = entryName(name);
  return container
    .getByRole("menuitem", { name: n })
    .or(container.getByRole("button", { name: n }))
    .or(container.getByRole("link", { name: n }));
}

/** Open the nav where `name` lives and follow it. */
export async function goViaConsoleNav(
  page: Page,
  name: string,
  place?: string,
): Promise<void> {
  const container = await openConsoleNav(page, place);
  await navEntry(container, name).first().click();
}

/**
 * The groups the viewer's Start menu (or home screen) draws, by name, read
 * once it is on screen. The Start menu is shut again afterwards.
 */
export async function consoleNavGroups(page: Page): Promise<string[]> {
  if (usesPhoneLayout(page)) {
    const home = await openConsoleNav(page);
    const groups = home.getByRole("navigation");
    await expect(
      home.getByRole("navigation", { name: "Me", exact: true }),
    ).toBeVisible();
    return groups.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? ""),
    );
  }
  const menu = await openConsoleNav(page);
  await expect(
    menu.getByRole("group", { name: "Me", exact: true }),
  ).toBeVisible();
  const names = await menu
    .getByRole("group")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  return names;
}

/** Shut the Start menu if it is open (the home screen needs no closing). */
export async function closeConsoleNav(page: Page): Promise<void> {
  if (usesPhoneLayout(page)) return;
  const menu = startMenu(page);
  if (await menu.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }
}
