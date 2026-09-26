import { test, expect } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedTeam,
  setRank,
} from "./_helpers";
import { desktopOnly } from "./lib/dom";
import {
  bottomBar,
  desktopIcon,
  desktopIcons,
  expectDesktop,
  homeScreen,
  liveWindow,
  navEntry,
  openConsoleNav,
  openToday,
  osWindow,
  startButton,
  startMenu,
  taskbar,
  taskbarWindow,
  usesPhoneLayout,
} from "./lib/console-nav";

// The console as the 404 OS desktop (PR C; docs/specs/2026-09-25-404-os-
// console-design.md). The URL is the focused window: every page keeps its
// path, gate and status code, and renders live inside its window; every other
// window is a frozen copy. This file replaces console-nav.spec.ts.
//
// Two blocking-questionnaire cases (a held member on a hard load and one held
// mid-session) and the builder's dirty guard need the questionnaire engine,
// which the in-memory store cannot run: they live in
// tests/e2e-db/desktop.spec.ts.

/** A cell on the desktop's icon grid (icon-grid's DEFAULT_GEOMETRY). */
const CELL = 96;

async function asRank(
  page: Page,
  request: APIRequestContext,
  authUserId: string,
  rank: "captain" | "member",
  displayName?: string,
) {
  await login(page, {
    id: authUserId,
    email: "god@example.com",
    ...(displayName ? { displayName } : {}),
  });
  await page.goto("/"); // lazily creates the camp user row
  await completeOnboarding(request, authUserId);
  await setRank(request, authUserId, rank);
}

/** A member let in by an invite that needs no approval, onboarded. */
async function approvedMember(
  page: Page,
  request: APIRequestContext,
  id: string,
  displayName: string,
) {
  await login(page, { id, email: `${id}@example.com`, displayName });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

/** The accessible names of the icons on the desktop, in the DOM's order. */
async function iconNames(page: Page): Promise<string[]> {
  return desktopIcons(page)
    .getByRole("option")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
}

/** An icon's place on the desktop, in px from the grid's corner. */
async function iconAt(icon: Locator): Promise<{ x: number; y: number }> {
  return icon.evaluate((el) => ({
    x: parseFloat((el as HTMLElement).style.left),
    y: parseFloat((el as HTMLElement).style.top),
  }));
}

/** Press on an icon's middle and let go `dx`, `dy` px away, in steps. */
async function dragBy(page: Page, from: Locator, dx: number, dy: number) {
  const box = (await from.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

/** The next save of the member's desktop layout (a debounced server action). */
function layoutSaved(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      !!r.request().headers()["next-action"] &&
      r.url().endsWith("/"),
  );
}

/** Open a program the way a member does on the desktop: double-click its icon. */
async function openIcon(page: Page, name: string) {
  await desktopIcon(page, name).dblclick();
}

test.describe("404 OS desktop (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("each profile gets its own icons, and nothing it cannot use", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the phone's home screen is covered below");

    // A plain member: Me and Camp, the camp-wide folders, the Terminal.
    await asRank(page, request, "icons-member", "member");
    await page.goto("/");
    await expectDesktop(page);
    // Present first, so the absences below are read off a painted desktop.
    await expect(desktopIcon(page, "Inbox")).toBeVisible();
    const member = await iconNames(page);
    for (const name of [
      "My forms",
      "My account",
      "Invites",
      "Tasks",
      "Calendar",
      "Roster",
      "Meetings",
      "Family tree",
      "Power",
      "Teams",
      "Kitchen",
      "Terminal",
    ]) {
      expect(member).toContain(name);
    }
    // Camp overview and the other captain programs are only ever inside the
    // Captains folder, so the folder is what a member must not have.
    expect(member).not.toContain("Captains");
    expect(member).not.toContain("My lift");

    // A team lead: the Captains folder holds a lead's tools only.
    await asRank(page, request, "icons-lead", "member");
    await seedTeam(request, "icons-lead", "kitchen", true);
    await page.goto("/");
    await expect(desktopIcon(page, "Captains")).toBeVisible();
    const leadCaptains = await openConsoleNav(page, "Captains");
    await expect(navEntry(leadCaptains, "Questionnaires")).toBeVisible();
    await expect(navEntry(leadCaptains, "Announcements")).toBeVisible();
    await expect(navEntry(leadCaptains, "New event")).toBeVisible();
    await expect(navEntry(leadCaptains, "Payments")).toHaveCount(0);
    await expect(navEntry(leadCaptains, "Audit log")).toHaveCount(0);

    // A captain: every captain program, in the Captains folder.
    await asRank(page, request, "icons-captain", "captain");
    await page.goto("/");
    await expect(desktopIcon(page, "Captains")).toBeVisible();
    await expect(desktopIcon(page, "Terminal")).toBeVisible();
    const captains = await openConsoleNav(page, "Captains");
    for (const name of [
      "Questionnaires",
      "Announcements",
      "New event",
      "Camp overview",
      "Payments",
      "Camp settings",
      "Join site",
      "Audit log",
      "System status",
    ]) {
      await expect(navEntry(captains, name)).toBeVisible();
    }
  });

  test("the Start menu: arrows walk it, Esc hands focus back to Start, Enter opens", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(
      testInfo,
      "a phone has no Start menu; its home screen is below",
    );
    await asRank(page, request, "start-keys", "member");
    await page.goto("/");
    await expectDesktop(page);

    const start = startButton(page);
    await start.focus();
    await page.keyboard.press("Enter");
    const menu = startMenu(page);
    await expect(menu).toBeVisible();
    // Above everything, and at most half the screen high.
    const box = (await menu.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(page.viewportSize()!.height / 2 + 1);
    const rows = menu.getByRole("menuitem");
    await expect(rows.first()).toBeFocused();
    await expect(rows.first()).toHaveAccessibleName(/^Inbox/);
    await page.keyboard.press("ArrowDown");
    await expect(
      menu.getByRole("menuitem", { name: "My forms" }),
    ).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "Log off" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(start).toBeFocused();

    // Enter on a row opens its program in a window.
    await page.keyboard.press("Enter");
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/tools/forms");
    await expect(osWindow(page, "My forms")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "My forms" }),
    ).toBeFocused();
    await expect(menu).toHaveCount(0);
  });

  test("two windows: the taskbar switches them, and a close focuses the next one down", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "a phone shows one window; its stack is below");
    await asRank(page, request, "two-windows", "member");
    await page.goto("/");
    await expectDesktop(page);

    await openIcon(page, "Roster");
    await expect(page).toHaveURL("/captains/camp-management");
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp management" }),
    ).toBeVisible();
    // The Roster opens full screen (a wide page), over the icons: the Start
    // menu is the way to a second program.
    await openConsoleNav(page, "Camp");
    await startMenu(page)
      .getByRole("menuitem", { name: "Family tree" })
      .click();
    await expect(page).toHaveURL("/family-tree");
    await expect(
      page.getByRole("heading", { level: 1, name: "Family tree" }),
    ).toBeVisible();

    // Both on the taskbar; the one on top is pressed.
    await expect(taskbarWindow(page, "Roster")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(taskbarWindow(page, "Family tree")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // One live page body: the Roster's page is not in the DOM, only its copy.
    await expect(page.locator("#os-window-content")).toHaveCount(1);

    await taskbarWindow(page, "Roster").click();
    await expect(page).toHaveURL("/captains/camp-management");
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp management" }),
    ).toBeVisible();
    await expect(taskbarWindow(page, "Roster")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await osWindow(page, "Roster")
      .getByRole("button", { name: "Close Roster" })
      .click();
    await expect(page).toHaveURL("/family-tree");
    await expect(
      page.getByRole("heading", { level: 1, name: "Family tree" }),
    ).toBeVisible();
    await expect(taskbarWindow(page, "Roster")).toHaveCount(0);
    await expect(taskbarWindow(page, "Family tree")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("after a close, Back goes to the entry before it, and may reopen a window closed earlier", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "a phone's Back closes windows; covered below");
    await asRank(page, request, "back-close", "member");
    await page.goto("/");
    await expectDesktop(page);

    // History: /, /family-tree, /tasks, then /family-tree again when its
    // window is brought forward.
    await openIcon(page, "Family tree");
    await expect(page).toHaveURL("/family-tree");
    await openConsoleNav(page, "Camp");
    await startMenu(page).getByRole("menuitem", { name: "Tasks" }).click();
    await expect(page).toHaveURL("/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
    await taskbarWindow(page, "Family tree").click();
    await expect(page).toHaveURL("/family-tree");

    // A close REPLACES its entry with the next window down (Tasks): no new
    // entry. Then Tasks closes too, and that entry becomes the desktop.
    const entries = () => page.evaluate(() => history.length);
    const before = await entries();
    await osWindow(page, "Family tree")
      .getByRole("button", { name: "Close Family tree" })
      .click();
    await expect(page).toHaveURL("/tasks");
    await expect(taskbarWindow(page, "Family tree")).toHaveCount(0);
    await osWindow(page, "Tasks")
      .getByRole("button", { name: "Close Tasks" })
      .click();
    await expect(page).toHaveURL("/");
    await expectDesktop(page);
    await expect(taskbarWindow(page, "Tasks")).toHaveCount(0);
    expect(await entries()).toBe(before);

    // Back goes to whatever entry came before the closed window's: Tasks,
    // closed a moment ago, opens again as a fresh window once the gate has
    // run again. And Back again, the Family tree.
    await page.goBack();
    await expect(page).toHaveURL("/tasks");
    await expect(osWindow(page, "Tasks")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL("/family-tree");
    await expect(
      page.getByRole("heading", { level: 1, name: "Family tree" }),
    ).toBeVisible();
  });

  test("a captain demoted mid-session presses Back onto a captain page and never sees it", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(
      testInfo,
      "on a phone the way to a second program goes through the home screen, so Back lands there; the gate check is the same code",
    );
    await asRank(page, request, "back-demoted", "captain");
    await page.goto("/captains/announcements");
    // The composer: what only a captain (or a lead) is sent.
    await expect(page.getByLabel("Title")).toBeVisible();

    await navEntry(await openConsoleNav(page, "Camp"), "Tasks").click();
    await expect(page).toHaveURL("/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();

    // Demoted by someone else while they work: this tab is not told.
    await setRank(request, "back-demoted", "member");

    // Watch every change to the page from now on: the router restores the
    // announcements page from its cache on Back, and the composer must never
    // be on screen, not even for one frame before the gate runs again.
    await page.evaluate(() => {
      const w = window as unknown as { __composerShown: boolean };
      w.__composerShown = false;
      const check = () => {
        const live = document.querySelector<HTMLElement>(
          "#os-window-content:not([hidden])",
        );
        if (!live) return;
        for (const label of live.querySelectorAll("label")) {
          if (label.textContent?.trim().startsWith("Title")) {
            w.__composerShown = true;
          }
        }
      };
      new MutationObserver(check).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["hidden"],
      });
    });
    await page.goBack();
    await expect(page).toHaveURL("/captains/announcements");
    await expect(page.getByText("Team leads and captains only")).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __composerShown: boolean }).__composerShown,
      ),
    ).toBe(false);
  });

  test("keyboard: Skip to window, past background windows to the taskbar, and Esc in a field keeps the program", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "a phone shows one window; its case is below");
    await asRank(page, request, "kb-walk", "member");
    await page.goto("/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();

    // On a fresh load the first Tab is Skip to window, and Enter lands in the
    // page (no history move, so no "Checking…" hiding it).
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to window" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#os-window-content")).toBeFocused();
    await expect(page.locator("#os-window-content")).toBeVisible();
    await expect(page).toHaveURL("/tasks");

    // Tasks, then the Family tree, then Tasks again: the Family tree's
    // frame now comes AFTER the live page in the document.
    await openConsoleNav(page, "Camp");
    await startMenu(page)
      .getByRole("menuitem", { name: "Family tree" })
      .click();
    await expect(page).toHaveURL("/family-tree");
    await taskbarWindow(page, "Tasks").click();
    await expect(page).toHaveURL("/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
    await page.locator("#os-window-content").focus();

    // Tab from the page reaches the taskbar without one stop in the Family
    // tree's frame (a background copy: no landmark, no tab stops).
    const stops: string[] = [];
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press("Tab");
      const at = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "none";
        if (el.closest('[role="toolbar"][aria-label="Taskbar"]')) {
          return "taskbar";
        }
        return (
          el.closest("section[data-window]")?.getAttribute("data-window") ??
          "other"
        );
      });
      stops.push(at);
      if (at === "taskbar") break;
    }
    expect(stops.at(-1)).toBe("taskbar");
    expect(stops).not.toContain("family-tree");
    await expect(page.getByRole("region", { name: "Family tree" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("region", { name: "Tasks" })).toHaveCount(1);

    // Esc in a search box clears or leaves the field; it never closes the
    // program under it.
    await page.goto("/captains/camp-management");
    const search = page.getByLabel("Search the roster");
    await search.fill("abc");
    await search.press("Escape");
    await page.waitForTimeout(300);
    await expect(page).toHaveURL("/captains/camp-management");
    await expect(osWindow(page, "Roster")).toBeVisible();
  });

  test("keyboard: closing the only window hands focus to its icon", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "a phone goes back to its home screen");
    await asRank(page, request, "kb-close", "member");
    await page.goto("/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
    const close = osWindow(page, "Tasks").getByRole("button", {
      name: "Close Tasks",
    });
    await close.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/");
    await expectDesktop(page);
    await expect(desktopIcon(page, "Tasks")).toBeFocused();
  });

  test("a background window shows its last-seen copy, with private fields blanked", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "a phone shows no background windows");
    // Record every shadow root, closed ones too, so the test can look inside
    // a copy (nothing else can: that is the point of a closed root).
    await page.addInitScript(() => {
      const w = window as unknown as { __osShadows: ShadowRoot[] };
      w.__osShadows = [];
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (init) {
        const root = attach.call(this, init);
        w.__osShadows.push(root);
        return root;
      };
    });
    await approvedMember(page, request, "copy-subject", "Pia Private");
    await asRank(page, request, "copy-captain", "captain");

    await page.goto("/captains/camp-management");
    const roster = page.getByRole("table");
    await roster
      .getByRole("button", { name: "Open Pia Private's profile" })
      .click();
    const note = page.getByLabel("Add a note");
    await note.fill("Owes the camp a tent pole");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Owes the camp a tent pole")).toBeVisible();
    await expect(page.getByLabel("Search the roster")).toHaveCount(1);

    // Switch away: the Roster keeps a frozen copy of how it looked.
    await openConsoleNav(page, "Camp");
    await startMenu(page).getByRole("menuitem", { name: "Tasks" }).click();
    await expect(page).toHaveURL("/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
    const rosterWindow = osWindow(page, "Roster");
    await expect(
      rosterWindow.getByText(/^Last seen \d\d:\d\d\./),
    ).toBeAttached();
    // The copy is in a closed shadow root: the page's own fields match once,
    // and the copy's never.
    await expect(page.getByLabel("Search the roster")).toHaveCount(0);
    await expect(page.getByText("Owes the camp a tent pole")).toHaveCount(0);

    const copy = await page.evaluate(() => {
      const w = window as unknown as { __osShadows: ShadowRoot[] };
      const root = w.__osShadows.find(
        (r) =>
          r.host.isConnected &&
          r.host
            .closest("section[data-window]")
            ?.getAttribute("data-window") === "roster",
      );
      if (!root) return null;
      return {
        text: root.textContent ?? "",
        search: !!root.querySelector("input"),
        privates: Array.from(root.querySelectorAll("[data-os-private]")).map(
          (el) => el.textContent,
        ),
      };
    });
    expect(copy).not.toBeNull();
    // The copy is the roster (present), but the notes and answers are blanked.
    expect(copy!.search).toBe(true);
    expect(copy!.privates.length).toBeGreaterThan(0);
    for (const text of copy!.privates) expect(text).toBe("Hidden");
    expect(copy!.text).not.toContain("Owes the camp a tent pole");

    // Back to the Roster: its page is live again, one of each field.
    await taskbarWindow(page, "Roster").click();
    await expect(page).toHaveURL("/captains/camp-management");
    await expect(page.getByLabel("Search the roster")).toHaveCount(1);
  });

  test("a reload keeps the open windows as frames with their icon and name", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "a phone shows one window at a time");
    await asRank(page, request, "reload-stack", "member");
    await page.goto("/");
    await expectDesktop(page);
    await openIcon(page, "Family tree");
    await expect(page).toHaveURL("/family-tree");
    await openConsoleNav(page, "Camp");
    await startMenu(page).getByRole("menuitem", { name: "Meetings" }).click();
    await expect(page).toHaveURL("/meetings");
    await expect(
      page.getByRole("heading", { level: 1, name: "Meetings" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Meetings" }),
    ).toBeVisible();
    // The Family tree is still open, as its name and icon (no copy survives
    // a reload: copies are memory only).
    const tree = osWindow(page, "Family tree");
    await expect(tree).toBeVisible();
    await expect(tree.getByText("Click to open.")).toBeVisible();
    await expect(taskbarWindow(page, "Family tree")).toBeVisible();
    await expect(taskbarWindow(page, "Meetings")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("Today: closed on a first visit, opened from its handle, still open after a reload", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "a phone opens Today as a sheet; covered below");
    await asRank(page, request, "today-handle", "member", "Tia Today");
    await page.goto("/");
    await expectDesktop(page);

    const handle = page.getByRole("button", { name: /^Show Today/ });
    await expect(handle).toBeVisible();
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    // The server always paints it closed, so the closed picture alone could
    // be read before the stored choice applies: nothing is stored yet.
    const stored = () =>
      page.evaluate(() => localStorage.getItem("camp404.os.today-open"));
    expect(await stored()).toBeNull();
    await expect(
      page.getByRole("complementary", { name: "Today" }),
    ).toHaveCount(0);

    const today = await openToday(page);
    await expect(
      today.getByRole("heading", { level: 2, name: "Hi Tia" }),
    ).toBeVisible();

    await page.reload();
    await expectDesktop(page);
    await expect(
      page
        .getByRole("complementary", { name: "Today" })
        .getByRole("heading", { level: 2, name: "Hi Tia" }),
    ).toBeVisible();
    // Closed again, it stays closed: the choice is written (the closed first
    // paint after a reload would pass on its own), then read back.
    await page.getByRole("button", { name: /^Hide Today/ }).click();
    await expect.poll(stored).toBe("false");
    await page.reload();
    await expectDesktop(page);
    await expect(
      page.getByRole("button", { name: /^Show Today/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Today" }),
    ).toHaveCount(0);
  });

  test("the Terminal opens a program it has, and answers not found for one it has not", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "term-member", "member");
    await page.goto("/terminal");
    await expect(osWindow(page, "Terminal")).toBeVisible();
    const prompt = liveWindow(page).getByRole("textbox");
    const output = page.getByRole("log", { name: "Terminal output" });

    // A captain program answers exactly like one that does not exist.
    await prompt.fill("open audit");
    await prompt.press("Enter");
    await expect(
      output.getByText("open: audit: not found. Try 'ls'."),
    ).toBeVisible();
    await expect(page).toHaveURL("/terminal");

    await prompt.fill("open roster");
    await prompt.press("Enter");
    await expect(page).toHaveURL("/captains/camp-management");
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp management" }),
    ).toBeVisible();
  });

  test("Esc inside a Select closes the list and keeps the program open", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "esc-select", "captain");
    await page.goto("/captains/calendar");
    await expect(
      page.getByRole("heading", { level: 1, name: "Add an event" }),
    ).toBeVisible();
    // The Select's list, not the desktop's icon grid (also a listbox).
    const list = page
      .getByRole("listbox")
      .and(page.locator(":not([data-os-icons])"));
    await page.locator("#event-team").click();
    await expect(list).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);
    await expect(page).toHaveURL("/captains/calendar");
    await expect(osWindow(page, "New event")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Add an event" }),
    ).toBeVisible();
  });

  test("a page that calls notFound() answers 404 inside its window", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "not-found", "member");
    const res = await page.goto(
      "/meetings/00000000-0000-4000-8000-000000000000",
    );
    expect(res?.status()).toBe(404);
    const win = osWindow(page, "Meeting");
    await expect(win).toBeVisible();
    await expect(
      win.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    // The desktop is still up around it.
    if (usesPhoneLayout(page)) {
      await expect(bottomBar(page)).toBeVisible();
    } else {
      await expect(taskbar(page)).toBeVisible();
    }
  });

  test("icons: select, add, box, drag to a new cell, open, kept on the server, lined up again", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the phone's home screen has a fixed order");
    await asRank(page, request, "icon-moves", "member");
    await page.goto("/");
    await expectDesktop(page);

    const inbox = desktopIcon(page, "Inbox");
    const forms = desktopIcon(page, "My forms");
    const account = desktopIcon(page, "My account");
    const invites = desktopIcon(page, "Invites");

    // Click selects one; Ctrl-click adds another.
    await inbox.click();
    await expect(inbox).toHaveAttribute("aria-selected", "true");
    await forms.click({ modifiers: ["Control"] });
    await expect(inbox).toHaveAttribute("aria-selected", "true");
    await expect(forms).toHaveAttribute("aria-selected", "true");
    // A plain click on another takes the selection to it alone.
    await account.click();
    await expect(inbox).toHaveAttribute("aria-selected", "false");
    await expect(account).toHaveAttribute("aria-selected", "true");

    // A box drawn from the empty desktop selects every icon it touches: from
    // an empty cell low in the first column, up over My account and Invites.
    const grid = (await desktopIcons(page).boundingBox())!;
    const from = { x: grid.x + 12 + CELL / 2, y: grid.y + 12 + 5 * CELL + 20 };
    await page.mouse.click(from.x, from.y); // clears the selection
    await expect(account).toHaveAttribute("aria-selected", "false");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, grid.y + 12 + 2 * CELL + 40, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(account).toHaveAttribute("aria-selected", "true");
    await expect(invites).toHaveAttribute("aria-selected", "true");
    await expect(inbox).toHaveAttribute("aria-selected", "false");

    // A drag moves the selection by whole cells, and it is there on drop.
    const before = await iconAt(invites);
    const accountBefore = await iconAt(account);
    const saved = layoutSaved(page);
    await dragBy(page, invites, 6 * CELL + 10, 0);
    expect(await iconAt(invites)).toEqual({
      x: before.x + 6 * CELL,
      y: before.y,
    });
    expect(await iconAt(account)).toEqual({
      x: accountBefore.x + 6 * CELL,
      y: accountBefore.y,
    });
    await saved;

    // Kept on the server: a reload draws them where they were left.
    await page.reload();
    await expectDesktop(page);
    await expect(invites).toBeVisible();
    expect(await iconAt(invites)).toEqual({
      x: before.x + 6 * CELL,
      y: before.y,
    });

    // Double-click opens; so does Enter on the focused icon.
    await invites.dblclick();
    await expect(page).toHaveURL("/tools/invite");
    await osWindow(page, "Invites")
      .getByRole("button", { name: "Close Invites" })
      .click();
    await expect(page).toHaveURL("/");
    await inbox.click();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/notifications");
    await osWindow(page, "Inbox")
      .getByRole("button", { name: "Close Inbox" })
      .click();
    await expect(page).toHaveURL("/");

    // "Line up icons" puts every icon back in its default place, and that
    // is kept too.
    const lined = layoutSaved(page);
    await desktopIcons(page).click({
      button: "right",
      position: { x: 12 + 8 * CELL, y: 12 + 4 * CELL },
    });
    await page
      .getByRole("menu", { name: "Desktop actions" })
      .getByRole("menuitem", { name: "Line up icons" })
      .click();
    expect(await iconAt(invites)).toEqual(before);
    await lined;
    await page.reload();
    await expectDesktop(page);
    await expect(invites).toBeVisible();
    expect(await iconAt(invites)).toEqual(before);
  });

  test("right-click and Shift+F10: a shortcut, a folder made, renamed, filled by a drag, and both deleted", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "member folders and shortcuts are desktop only");
    await asRank(page, request, "icon-menus", "member");
    await page.goto("/");
    await expectDesktop(page);

    // A shortcut, from a program's menu. It wears the small arrow.
    await desktopIcon(page, "Calendar").click({ button: "right" });
    const calendarMenu = page.getByRole("menu", { name: "Calendar actions" });
    await expect(calendarMenu).toBeVisible();
    await calendarMenu
      .getByRole("menuitem", { name: "Create desktop shortcut" })
      .click();
    const shortcut = desktopIcons(page).getByRole("option", {
      name: "Calendar, shortcut",
    });
    await expect(shortcut).toBeVisible();
    await expect(shortcut.locator("[data-shortcut]")).toBeVisible();

    // Shift+F10 on the focused icon opens the same menu from the keyboard;
    // Esc shuts it and hands focus back.
    const roster = desktopIcon(page, "Roster");
    await roster.click();
    await page.keyboard.press("Shift+F10");
    const rosterMenu = page.getByRole("menu", { name: "Roster actions" });
    await expect(rosterMenu).toBeVisible();
    await expect(
      rosterMenu.getByRole("menuitem", { name: "Open" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(rosterMenu).toHaveCount(0);
    await expect(roster).toBeFocused();

    // A folder, from the empty desktop's menu.
    await desktopIcons(page).click({
      button: "right",
      position: { x: 12 + 8 * CELL, y: 12 + 4 * CELL },
    });
    await page
      .getByRole("menu", { name: "Desktop actions" })
      .getByRole("menuitem", { name: "New folder" })
      .click();
    const nameDialog = page.getByRole("dialog", {
      name: "Name your new folder",
    });
    await nameDialog.getByLabel("Folder name").fill("Stuff");
    await nameDialog.getByRole("button", { name: "Save" }).click();
    const folder = desktopIcons(page).getByRole("option", {
      name: "Stuff, 0 items",
    });
    await expect(folder).toBeVisible();

    // Renamed.
    await folder.click({ button: "right" });
    await page
      .getByRole("menu", { name: "Stuff actions" })
      .getByRole("menuitem", { name: "Rename" })
      .click();
    const renameDialog = page.getByRole("dialog", {
      name: "Rename this folder",
    });
    await renameDialog.getByLabel("Folder name").fill("Things");
    await renameDialog.getByRole("button", { name: "Save" }).click();
    const things = desktopIcons(page).getByRole("option", {
      name: "Things, 0 items",
    });
    await expect(things).toBeVisible();

    // An icon dragged onto it goes in: the last change before the reload,
    // so the save that follows it is the one to wait for (registered first,
    // so it cannot land unseen).
    const tasks = desktopIcon(page, "Tasks");
    const t = (await tasks.boundingBox())!;
    const f = (await things.boundingBox())!;
    const saved = layoutSaved(page);
    await dragBy(
      page,
      tasks,
      f.x + f.width / 2 - (t.x + t.width / 2),
      f.y + f.height / 2 - (t.y + t.height / 2),
    );
    const full = desktopIcons(page).getByRole("option", {
      name: "Things, 1 item",
    });
    await expect(full).toBeVisible();
    // The program is still on the desktop: a folder holds a link to it.
    await expect(tasks).toBeVisible();
    await full.dblclick();
    const folderWindow = osWindow(page, "Things");
    await expect(folderWindow).toBeVisible();
    await expect(
      folderWindow.getByRole("button", { name: "Open Tasks" }),
    ).toBeVisible();
    await folderWindow.getByRole("button", { name: "Close Things" }).click();

    // Kept on the server.
    await saved;
    await page.reload();
    await expectDesktop(page);
    await expect(full).toBeVisible();
    await expect(shortcut).toBeVisible();

    // Both deleted.
    await shortcut.click({ button: "right" });
    await page
      .getByRole("menu", { name: "Calendar actions" })
      .getByRole("menuitem", { name: "Delete shortcut" })
      .click();
    await expect(shortcut).toHaveCount(0);
    await full.click({ button: "right" });
    const deleted = layoutSaved(page);
    await page
      .getByRole("menu", { name: "Things actions" })
      .getByRole("menuitem", { name: "Delete folder" })
      .click();
    await expect(full).toHaveCount(0);
    await expect(desktopIcon(page, "Calendar")).toBeVisible();

    // And the deletions are kept too.
    await deleted;
    await page.reload();
    await expectDesktop(page);
    await expect(desktopIcon(page, "Calendar")).toBeVisible();
    await expect(shortcut).toHaveCount(0);
    await expect(full).toHaveCount(0);
    await expect(
      desktopIcons(page).getByRole("option", { name: /^Things/ }),
    ).toHaveCount(0);
  });

  test("team folders sit on the right, led first and tagged LEAD; the account chip says who leads what", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the phone's My teams row is covered below");
    await asRank(page, request, "folders-lead", "member", "Lee Lead");
    await seedTeam(request, "folders-lead", "sound");
    await seedTeam(request, "folders-lead", "kitchen", true);
    await page.goto("/");
    await expectDesktop(page);

    const kitchen = desktopIcon(page, "Kitchen team");
    const sound = desktopIcon(page, "Sound team");
    await expect(kitchen).toHaveAccessibleName("Kitchen team, you lead it");
    await expect(kitchen.locator("[data-lead]")).toBeVisible();
    await expect(sound).toHaveAccessibleName("Sound team");
    await expect(sound.locator("[data-lead]")).toHaveCount(0);
    // Down the right-hand side, the led one first. The grid is laid out
    // again once it has measured the screen: read after it settles.
    await expect
      .poll(async () => (await iconAt(kitchen)).x - (await iconAt(sound)).x)
      .toBe(0);
    const k = await iconAt(kitchen);
    const s = await iconAt(sound);
    const me = await iconAt(desktopIcon(page, "Inbox"));
    expect(k.x).toBe(s.x);
    expect(k.y).toBeLessThan(s.y);
    expect(k.x).toBeGreaterThan(me.x + 5 * CELL);

    // The folder holds the team's page.
    await kitchen.dblclick();
    const folder = osWindow(page, "Kitchen team");
    await expect(folder).toBeVisible();
    await folder
      .getByRole("button", { name: /^Open Kitchen/ })
      .first()
      .click();
    await expect(page).toHaveURL("/teams/kitchen");

    // One team led: its name on the chip.
    const chip = page.locator("[data-os-account]");
    await expect(chip).toHaveAccessibleName(
      "Lee Lead, Team Lead. Leads Kitchen. Open My account",
    );
    await expect(chip.getByText("Leads Kitchen")).toBeVisible();

    // Two teams led: a count, and the list in a tooltip on hover.
    await seedTeam(request, "folders-lead", "sound", true);
    await page.goto("/");
    await expect(chip.getByText("Leads 2 teams")).toBeVisible();
    await expect(chip).toHaveAccessibleName(/Leads Kitchen, Sound\./);
    await chip.hover();
    await expect(chip.locator("[data-os-tooltip]")).toBeVisible();
    await expect(chip.locator("[data-os-tooltip]")).toHaveText(
      "Leads Kitchen, Sound",
    );
  });

  test("system health: a member reads one sentence; a captain's opens System status", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the phone draws the same line on its home screen");
    await asRank(page, request, "health-member", "member");
    await page.goto("/");
    await expectDesktop(page);
    const memberItem = taskbar(page).getByRole("button", {
      name: "System health",
      exact: true,
    });
    await expect(memberItem).toBeVisible();
    await memberItem.click();
    await expect(
      taskbar(page).getByText("Something in the app is not working right now."),
    ).toBeVisible();
    // Nowhere to go from it.
    await expect(page.getByRole("link", { name: /System status/ })).toHaveCount(
      0,
    );

    await asRank(page, request, "health-captain", "captain");
    await page.goto("/");
    await expectDesktop(page);
    const captainItem = taskbar(page).getByRole("button", {
      name: /^System health, \d+ warnings?$/,
    });
    await expect(captainItem).toBeVisible();
    await captainItem.click();
    await expect(page).toHaveURL("/captains/system");
    await expect(
      page.getByRole("heading", { level: 1, name: "System status" }),
    ).toBeVisible();
  });

  test("a rejected applicant gets no desktop", async ({ page, request }) => {
    await request.post("/api/test/seed-invite", {
      data: { code: "NO-DESK", maxUses: 1, requiresApproval: true },
    });
    await login(page, { id: "no-desk", email: "no-desk@example.com" });
    await redeemInviteAtGate(page, "NO-DESK");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "no-desk");
    await request.post("/api/test/set-approval", {
      data: { authUserId: "no-desk", status: "rejected", reason: "Full." },
    });

    // The inbox is open to applicants, so the page itself renders, but in a
    // plain column: a desktop would say "Application submitted".
    await page.goto("/notifications");
    await expect(page).toHaveURL("/notifications");
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeVisible();
    await expect(page.locator("#os-desktop")).toHaveCount(0);
    await expect(taskbar(page)).toHaveCount(0);
    await expect(bottomBar(page)).toHaveCount(0);
  });

  test("an idle desktop with two windows open costs next to no CPU", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "measured once, on the desktop");
    await asRank(page, request, "idle-cpu", "member");
    await page.goto("/");
    await expectDesktop(page);
    await openIcon(page, "Family tree");
    await expect(
      page.getByRole("heading", { level: 1, name: "Family tree" }),
    ).toBeVisible();
    await openConsoleNav(page, "Camp");
    await startMenu(page).getByRole("menuitem", { name: "Meetings" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Meetings" }),
    ).toBeVisible();
    // Let the page settle (the idle copy, fonts), then measure.
    await page.mouse.move(2, 2);
    await page.waitForTimeout(1500);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const read = async () => {
      const { metrics } = await cdp.send("Performance.getMetrics");
      const get = (name: string) =>
        metrics.find((m) => m.name === name)?.value ?? 0;
      return { task: get("TaskDuration"), script: get("ScriptDuration") };
    };
    const a = await read();
    await page.waitForTimeout(4000);
    const b = await read();
    const taskMs = (b.task - a.task) * 1000;
    const scriptMs = (b.script - a.script) * 1000;
    testInfo.annotations.push({
      type: "idle-cpu",
      description: `${taskMs.toFixed(1)} ms task, ${scriptMs.toFixed(1)} ms script in 4 s`,
    });
    // Budget: 2.5% of one core over 4 s. Measured 1 to 5 ms under next dev.
    expect(taskMs).toBeLessThan(100);
  });
});

test.describe("404 OS on a phone (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a program open full screen: Tab never lands on the home screen under it", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await asRank(page, request, "phone-tab", "member");
    await page.goto("/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
    await expect(homeScreen(page)).toHaveAttribute("inert", "");

    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to window" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    const onHome = await page.evaluate(
      () => !!document.activeElement?.closest("[data-os-phone-home]"),
    );
    expect(onHome).toBe(false);
    // The home screen's groups are not read out over the program: Chrome's
    // own accessibility tree (Playwright's role queries do not apply
    // `inert`), the one a screen reader gets.
    const landmarks = async () => {
      const cdp = await page.context().newCDPSession(page);
      const { nodes } = await cdp.send("Accessibility.getFullAXTree");
      await cdp.detach();
      return nodes
        .filter((n) => !n.ignored && n.role?.value === "navigation")
        .map((n) => String(n.name?.value ?? ""));
    };
    expect(await landmarks()).not.toContain("Me");

    // Home: the home screen is live again.
    await bottomBar(page).getByRole("button", { name: "Home" }).click();
    await expect(page).toHaveURL("/");
    await expect(homeScreen(page)).not.toHaveAttribute("inert", "");
    await expect.poll(landmarks).toContain("Me");
  });

  for (const width of [360, 390]) {
    test(`at ${width} px: the home screen, a folder sheet, a full-screen program, the bottom bar, Today and Back`, async ({
      page,
      request,
    }) => {
      await asRank(page, request, `phone-${width}`, "captain", "Pip Phone");
      await seedTeam(request, `phone-${width}`, "kitchen", true);

      // A member folder made on the desktop stays on the desktop.
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto("/");
      await expectDesktop(page);
      const saved = layoutSaved(page);
      await desktopIcons(page).click({
        button: "right",
        position: { x: 12 + 8 * CELL, y: 12 + 4 * CELL },
      });
      await page
        .getByRole("menu", { name: "Desktop actions" })
        .getByRole("menuitem", { name: "New folder" })
        .click();
      const dialog = page.getByRole("dialog", { name: "Name your new folder" });
      await dialog.getByLabel("Folder name").fill("Desk only");
      await dialog.getByRole("button", { name: "Save" }).click();
      await saved;

      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expectDesktop(page);
      const home = homeScreen(page);
      // The groups in the desktop's order, then My teams.
      const groups = await home
        .getByRole("navigation")
        .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
      expect(groups).toEqual(["Me", "Camp", "Captains", "My teams"]);
      await expect(
        home
          .getByRole("navigation", { name: "My teams" })
          .getByRole("button", { name: "Kitchen team, you lead it" }),
      ).toBeVisible();
      // No member folders or shortcuts, and no icon grid or taskbar.
      await expect(home.getByRole("button", { name: /Desk only/ })).toHaveCount(
        0,
      );
      await expect(desktopIcons(page)).toBeHidden();
      await expect(taskbar(page)).toBeHidden();
      // Nothing scrolls sideways.
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);

      // A folder opens as a full-screen sheet with a big Back.
      await home.getByRole("button", { name: "Kitchen", exact: true }).click();
      const kitchen = osWindow(page, "Kitchen");
      await expect(kitchen).toBeVisible();
      expect((await kitchen.boundingBox())!.width).toBe(width);
      await expect(
        kitchen.getByRole("button", { name: "Open Recipes" }),
      ).toBeVisible();
      await kitchen
        .getByRole("button", { name: "Back, close Kitchen" })
        .click();
      await expect(kitchen).toHaveCount(0);

      // A program opens full screen.
      await home.getByRole("button", { name: "Roster", exact: true }).click();
      await expect(page).toHaveURL("/captains/camp-management");
      const roster = osWindow(page, "Roster");
      await expect(
        page.getByRole("heading", { level: 1, name: "Camp management" }),
      ).toBeVisible();
      const box = (await roster.boundingBox())!;
      expect(box.x).toBe(0);
      expect(box.width).toBe(width);
      const bar = bottomBar(page);
      await expect(bar).toBeVisible();
      await expect(bar.getByRole("button", { name: "Home" })).toBeVisible();
      await expect(
        bar.getByRole("button", { name: "Open programs, 1" }),
      ).toBeVisible();
      await expect(
        bar.getByRole("button", { name: /^Notifications/ }),
      ).toBeVisible();
      await expect(bar.getByRole("button", { name: /^Today/ })).toBeVisible();

      // Home, then a second program: two in Open programs.
      await bar.getByRole("button", { name: "Home" }).click();
      await expect(page).toHaveURL("/");
      await expect(home).toBeVisible();
      await home.getByRole("button", { name: "Family tree" }).click();
      await expect(page).toHaveURL("/family-tree");
      await expect(
        page.getByRole("heading", { level: 1, name: "Family tree" }),
      ).toBeVisible();
      await bar.getByRole("button", { name: "Open programs, 2" }).click();
      const switcher = page.getByRole("list", { name: "Open programs" });
      await expect(
        switcher.getByRole("button", { name: /^Roster/ }),
      ).toBeVisible();
      await page
        .getByRole("region", { name: "Open programs" })
        .getByRole("button", { name: "Close Open programs" })
        .click();

      // Back from the program closes its window and lands on the home screen
      // entry; Back again reopens the Roster, full screen.
      await page.goBack();
      await expect(page).toHaveURL("/");
      await expect(
        bar.getByRole("button", { name: "Open programs, 1" }),
      ).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL("/captains/camp-management");
      await expect(
        page.getByRole("heading", { level: 1, name: "Camp management" }),
      ).toBeVisible();

      // Today is a sheet, from any program (it goes home first).
      const today = await openToday(page);
      await expect(
        today.getByRole("heading", { level: 2, name: "Hi Pip" }),
      ).toBeVisible();
      await today.getByRole("button", { name: "Close Today" }).click();
      await expect(today).toHaveCount(0);

      // The Back button on a program closes it.
      await home.getByRole("button", { name: "Roster", exact: true }).click();
      await expect(page).toHaveURL("/captains/camp-management");
      await osWindow(page, "Roster")
        .getByRole("button", { name: "Back, close Roster" })
        .click();
      await expect(page).toHaveURL("/");
      await expect(home).toBeVisible();
    });
  }
});
