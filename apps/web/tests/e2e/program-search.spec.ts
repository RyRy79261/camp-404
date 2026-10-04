import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
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
  expectDesktop,
  liveWindow,
  usesPhoneLayout,
} from "./lib/console-nav";

// Ctrl+K program search (issue #326, step 1). The box lists what the
// member's manifest holds, which the server filters by rank, so a plain
// member never finds a captain's program; Enter opens the program's window
// the way the Start menu does. It opens in Programs (#350), which asks the
// server nothing; Everything finds camp entries too.

async function asRank(
  page: Page,
  request: APIRequestContext,
  id: string,
  rank: "captain" | "member",
) {
  // The founder address lets a member in without an invite; the rank the
  // test sets is what the manifest reads (as os-shell.spec.ts does).
  await login(page, { id, email: "god@example.com", displayName: id });
  await page.goto("/");
  await completeOnboarding(request, id);
  await setRank(request, id, rank);
  await page.goto("/");
  await expectDesktop(page);
}

function searchBox(page: Page) {
  return page.getByRole("dialog", { name: "Search" });
}

function result(page: Page, name: string | RegExp) {
  return searchBox(page).getByRole("option", { name });
}

/** Ctrl+K, once the desktop has hydrated (the listener is React's). */
async function pressCtrlK(page: Page) {
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(searchBox(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

function scopeRadio(page: Page, name: "Programs" | "Everything") {
  return searchBox(page)
    .getByRole("radiogroup", { name: "Search in" })
    .getByRole("radio", { name });
}

/** Every /api/search request the page makes from now on. */
function searchRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/search") seen.push(r.url());
  });
  return seen;
}

test.describe("Ctrl+K program search (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("Ctrl+K opens it, typing finds Power, Enter opens its window, Esc gives focus back", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the phone opens search from its bottom bar, below");
    await asRank(page, request, "search-member", "member");

    await pressCtrlK(page);
    const input = searchBox(page).getByRole("combobox");
    await expect(input).toBeFocused();
    await input.fill("pow");
    const power = result(page, /^Power,/);
    await expect(power).toBeVisible();
    // The program's group on the right, and it is the first row, picked.
    await expect(power).toContainText("Power and Lighting");
    await expect(power).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");

    await expect(searchBox(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/power$/);
    await expect(liveWindow(page)).toHaveAttribute(
      "data-window-title",
      "Power",
    );

    // Opened once, it is Recent in the empty box, even with its window in
    // focus.
    await pressCtrlK(page);
    await expect(searchBox(page).getByText("Recent")).toBeVisible();
    await expect(result(page, /^Power,/)).toBeVisible();

    // Arrows move, Esc shuts it and gives focus back.
    await page.keyboard.press("Escape");
    await expect(searchBox(page)).toHaveCount(0);
    const startButton = page.locator("[data-os-start-button]");
    await startButton.focus();
    await pressCtrlK(page);
    await searchBox(page).getByRole("combobox").fill("my");
    const first = searchBox(page).locator('[aria-selected="true"]');
    const firstName = await first.textContent();
    await page.keyboard.press("ArrowDown");
    await expect(first).not.toHaveText(firstName ?? "");
    await page.keyboard.press("Escape");
    await expect(searchBox(page)).toHaveCount(0);
    await expect(startButton).toBeFocused();
  });

  test("a plain member never finds a captain's program; a captain does", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the same list on a phone, opened below");
    await asRank(page, request, "search-plain", "member");
    await pressCtrlK(page);
    const input = searchBox(page).getByRole("combobox");
    await input.fill("camp");
    // Present first: the member's own Camp programs are found...
    await expect(result(page, /^Camp layout,/)).toBeVisible();
    // ...and the captains' are not.
    await expect(result(page, /^Camp settings,/)).toHaveCount(0);
    await expect(result(page, /^Camp overview,/)).toHaveCount(0);
    await input.fill("audit log");
    // Programs finds nothing: one row offers Everything instead.
    await expect(
      result(page, /^Search everything for “audit log”/),
    ).toBeVisible();
    await expect(
      searchBox(page).getByTestId("search-footer-status"),
    ).toHaveText("No program found");

    await page.keyboard.press("Escape");
    await asRank(page, request, "search-captain", "captain");
    await pressCtrlK(page);
    await searchBox(page).getByRole("combobox").fill("camp");
    await expect(result(page, /^Camp settings,/)).toBeVisible();
    await expect(
      result(page, "Camp settings, Program, Captains"),
    ).toBeVisible();
  });

  test("on a phone, the bottom bar's Search opens it full screen", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(usesPhoneLayout(page)).toBe(true);
    await asRank(page, request, "search-phone", "member");

    const button = bottomBar(page).getByRole("button", {
      name: "Search",
      exact: true,
    });
    await expect(async () => {
      await button.click();
      await expect(searchBox(page)).toBeVisible({ timeout: 1_000 });
    }).toPass();
    // Full screen: as wide as the phone, from the top.
    const box = (await searchBox(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(389);
    expect(box.y).toBeLessThanOrEqual(1);
    // Every cell of the bottom bar still fits on the screen.
    for (const cell of await bottomBar(page).getByRole("button").all()) {
      const b = (await cell.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(390);
    }

    await searchBox(page).getByRole("combobox").fill("pow");
    await result(page, /^Power,/).click();
    await expect(page).toHaveURL(/\/power$/);
    await expect(searchBox(page)).toHaveCount(0);

    // Cancel shuts it.
    await button.click();
    await expect(searchBox(page)).toBeVisible();
    await searchBox(page).getByRole("button", { name: "Cancel" }).click();
    await expect(searchBox(page)).toHaveCount(0);
  });
});

// Step 2, "search everything": the box finds camp entries too, each kind
// filtered on the server by the rule of the page it opens (here, through the
// test store's twin). A hit opens the exact entry in its program's window.

const POT_BOOK = {
  title: "Potjiekos for 40",
  plates: [40],
  ingredients: [
    {
      name: "Beef shin",
      category: "protein",
      quantity: 6,
      unit: "kg",
      allergens: [],
    },
  ],
};

/** A member who signed up with an invite (so not the founder address). */
async function invitedMember(
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

/** Ctrl+K in Everything (a click on the toggle when it is on Programs). */
async function typeSearch(page: Page, text: string) {
  await pressCtrlK(page);
  const everything = scopeRadio(page, "Everything");
  if ((await everything.getAttribute("aria-checked")) !== "true") {
    await everything.click();
    await expect(everything).toHaveAttribute("aria-checked", "true");
  }
  await searchBox(page).getByRole("combobox").fill(text);
}

test.describe("Ctrl+K search everything (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member finds a recipe in the book and opens it; another member's suggestion is the captain's to find", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the phone's rows are checked below");
    // A suggestion that is not in the book, and a recipe that is.
    await invitedMember(page, request, "se-cook", "Cook Suggester");
    await page.goto("/kitchen/recipes/new");
    await page
      .getByLabel("Recipe text")
      .fill("Pot bread on the coals\n500 g flour, yeast, water. Bake 1 h.");
    await page.getByRole("button", { name: "Import recipe" }).click();
    await expect(page).toHaveURL(/\/kitchen\/recipes\/[0-9a-f-]{36}$/);
    const seeded = await request.post("/api/test/seed-kitchen-book", {
      data: { authUserId: "se-cook", recipes: [POT_BOOK] },
    });
    expect(seeded.ok()).toBe(true);

    await asRank(page, request, "se-member", "member");
    await typeSearch(page, "pot");
    const book = result(page, /^Potjiekos for 40, Recipe, 40 plates/);
    // Present first, then the absence.
    await expect(book).toBeVisible();
    await expect(result(page, /^Pot bread on the coals,/)).toHaveCount(0);
    await expect(
      searchBox(page).getByTestId("search-footer-status"),
    ).toHaveText(/\d+ found/);
    await book.click();
    await expect(searchBox(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/kitchen\/recipes\/[0-9a-f-]{36}$/);
    await expect(
      liveWindow(page).getByRole("heading", {
        level: 1,
        name: "Potjiekos for 40",
      }),
    ).toBeVisible();

    // Opened from search, the entry is Recent: the server looks it up again
    // (Everything is remembered).
    await pressCtrlK(page);
    await expect(scopeRadio(page, "Everything")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(searchBox(page).getByText("Recent")).toBeVisible();
    await expect(result(page, /^Potjiekos for 40, Recipe/)).toBeVisible();
    await page.keyboard.press("Escape");

    // The Kitchen's reviewers (a captain here) see the suggestion too.
    await asRank(page, request, "se-captain", "captain");
    await typeSearch(page, "pot");
    await expect(
      result(page, /^Pot bread on the coals, Recipe, Suggestion/),
    ).toBeVisible();
  });

  test("a person result opens the public card on the roster", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "one layout is enough for the deep link");
    await invitedMember(page, request, "se-spotty", "Spotty van Wyk");
    await asRank(page, request, "se-viewer", "member");
    await typeSearch(page, "spotty");
    const person = result(page, /^Spotty van Wyk, Person/);
    await expect(person).toBeVisible();
    await person.click();
    await expect(page).toHaveURL(/\/captains\/camp-management\?member=/);
    await expect(
      page.getByRole("region", { name: "Spotty van Wyk profile" }),
    ).toBeVisible();
  });

  test("an inventory hit opens that exact item while Inventory is already open on another", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "a phone shows one window at a time");
    await asRank(page, request, "se-gear", "captain");
    const seeded = await request.post("/api/test/seed-prints", {
      data: { authUserId: "se-gear" },
    });
    expect(seeded.ok()).toBe(true);

    await typeSearch(page, "extension");
    await result(page, /^Extension reels, Inventory/).click();
    await expect(page).toHaveURL(/\/inventory\/[0-9a-f-]{36}$/);
    const first = page.url();
    await expect(
      liveWindow(page).getByRole("heading", {
        level: 1,
        name: "Extension reels",
      }),
    ).toBeVisible();

    // Inventory's window is open: the next hit still lands on its own item,
    // not where the window was left.
    await typeSearch(page, "festoon");
    await result(page, /^Festoon lights, Inventory/).click();
    await expect(page).not.toHaveURL(first);
    await expect(
      liveWindow(page).getByRole("heading", {
        level: 1,
        name: "Festoon lights",
      }),
    ).toBeVisible();
    await expect(liveWindow(page)).toHaveAttribute(
      "data-window-title",
      "Inventory",
    );
  });

  test("a task hit opens the board on its card, marked", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "one layout is enough for the deep link");
    await asRank(page, request, "se-task-captain", "captain");
    await page.goto("/tasks");
    await page.getByRole("button", { name: "Add task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Order the shade cloth");
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Task added")).toBeVisible();

    await asRank(page, request, "se-task-member", "member");
    await typeSearch(page, "shade cloth");
    await result(page, /^Order the shade cloth, Task/).click();
    await expect(page).toHaveURL(/\/tasks\?task=[\w-]+$/);
    const card = liveWindow(page).getByRole("article", {
      name: "Order the shade cloth",
    });
    await expect(card).toHaveAttribute("aria-current", "true");
    // A member who may not edit it gets no form.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a lounge hit opens the programme on its day, marked; another host's unplaced offer is not found", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "one layout is enough for the deep link");
    await invitedMember(page, request, "se-dj", "Dee Jay");
    await invitedMember(page, request, "se-vibes", "Vee Lead");
    await seedTeam(request, "se-vibes", "ministry_of_vibes", true);
    const offer = (title: string) => ({
      kind: "activity",
      title,
      description: null,
      durationMinutes: 60,
      needs: [],
      needsNote: null,
      preferredDays: [3],
      preferredBands: ["sunset"],
      recurring: false,
      publicGuide: true,
    });
    const seeded = await request.post("/api/test/seed-lounge", {
      data: {
        runnerAuthUserId: "se-vibes",
        offers: [
          {
            hostAuthUserId: "se-dj",
            offer: offer("Potluck and poetry hour"),
            decision: "accepted",
            places: [{ day: 3, startMinute: 17 * 60 }],
          },
          { hostAuthUserId: "se-dj", offer: offer("Pot noodle DJ set") },
        ],
      },
    });
    expect(seeded.ok()).toBe(true);

    await asRank(page, request, "se-lounge-member", "member");
    await typeSearch(page, "pot");
    const hit = result(page, /^Potluck and poetry hour, Lounge, Day 3 · 17:00/);
    await expect(hit).toBeVisible();
    await expect(result(page, /^Pot noodle DJ set,/)).toHaveCount(0);
    await hit.click();
    await expect(page).toHaveURL(/\/lounge\?offer=[\w-]+$/);
    await expect(
      liveWindow(page).getByRole("tab", { name: "Programme" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      liveWindow(page)
        .locator('[data-search-focus="true"]')
        .filter({ visible: true }),
    ).toContainText("Potluck and poetry hour");
  });

  test("a shift hit opens the roster on a day it runs, marked", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "one layout is enough for the deep link");
    await asRank(page, request, "se-shift-captain", "captain");
    // The Burn's days, then one shift on each.
    const day = (n: number) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Johannesburg",
      }).format(new Date(Date.now() + n * 86_400_000));
    await page.goto("/logistics");
    const burn = page.getByRole("dialog", { name: "Burn" });
    await expect(async () => {
      await page.getByRole("button", { name: "Edit Burn" }).click();
      await expect(burn).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await burn.getByLabel("First day").fill(day(10));
    await burn.getByLabel("Last day").fill(day(11));
    await burn.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Burn saved")).toBeVisible();
    await page.goto("/shifts");
    const add = page.getByRole("dialog", { name: "Add a shift" });
    await expect(async () => {
      await page.getByRole("button", { name: "Add a shift" }).first().click();
      await expect(add).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await add.getByRole("combobox", { name: "Team" }).click();
    await page.getByRole("option", { name: "Kitchen", exact: true }).click();
    await add.getByLabel("Name").fill("Pot wash, evening");
    await add.getByLabel("Starts").fill("19:00");
    await add.getByLabel("Ends").fill("21:00");
    await add.getByLabel("People").fill("2");
    await add.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Pot wash, evening saved/)).toBeVisible();

    await asRank(page, request, "se-shift-member", "member");
    await typeSearch(page, "pot wash");
    await result(page, /^Pot wash, evening, Shift, .*19:00–21:00/).click();
    await expect(page).toHaveURL(/\/shifts\?shift=[\w-]+$/);
    await expect(
      liveWindow(page)
        .getByTestId("shift-day")
        .locator('[data-search-focus="true"]')
        .filter({ visible: true }),
    ).toContainText("Pot wash, evening");
  });

  test("a gear hit opens My gear on that item, marked", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "one layout is enough for the deep link");
    await asRank(page, request, "se-gear-captain", "captain");
    await page.goto("/captains/gear-rental/catalogue");
    await page.getByLabel("Name").fill("Self-inflating mattress");
    await page.getByLabel("Supplier price (R)").fill("80");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(
      page.getByText("Self-inflating mattress").filter({ visible: true }),
    ).toBeVisible();

    await asRank(page, request, "se-gear-member", "member");
    await typeSearch(page, "mattress");
    await result(page, /^Self-inflating mattress, Gear, To rent/).click();
    await expect(page).toHaveURL(/\/gear\?item=[\w-]+$/);
    await expect(
      liveWindow(page)
        .locator('[data-search-focus="true"]')
        .filter({ visible: true }),
    ).toContainText("Self-inflating mattress");
  });

  test("with no connection, programs still filter and the box says why", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the same box on a phone");
    await asRank(page, request, "se-offline", "member");
    await page.route("**/api/search?**", (route) => route.abort("failed"));
    await typeSearch(page, "pow");
    await expect(result(page, /^Power, Program/)).toBeVisible();
    await expect(searchBox(page).getByTestId("search-offline")).toContainText(
      "Camp entries need a connection.",
    );
    await expect(
      searchBox(page).getByTestId("search-footer-status"),
    ).toHaveText("Programs only: no connection");
  });

  test("on a phone, rows take two lines: the title, then what it is", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await invitedMember(page, request, "se-phone-cook", "Phone Cook");
    const seeded = await request.post("/api/test/seed-kitchen-book", {
      data: { authUserId: "se-phone-cook", recipes: [POT_BOOK] },
    });
    expect(seeded.ok()).toBe(true);
    await asRank(page, request, "se-phone", "member");
    const button = bottomBar(page).getByRole("button", {
      name: "Search",
      exact: true,
    });
    await expect(async () => {
      await button.click();
      await expect(searchBox(page)).toBeVisible({ timeout: 1_000 });
    }).toPass();
    // The tap focused the field itself (so iOS shows the keyboard).
    await expect(searchBox(page).getByRole("combobox")).toBeFocused();
    // The toggle is a full-width row under the field: two big targets.
    const toggle = searchBox(page).getByRole("radiogroup", {
      name: "Search in",
    });
    const t = (await toggle.boundingBox())!;
    expect(t.width).toBeGreaterThanOrEqual(360);
    await scopeRadio(page, "Everything").click();
    await expect(searchBox(page).getByRole("combobox")).toBeFocused();
    await searchBox(page).getByRole("combobox").fill("potjie");
    const row = result(page, /^Potjiekos for 40, Recipe/);
    await expect(row).toBeVisible();
    const box = (await row.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    const title = (await row.getByText("Potjiekos for 40").boundingBox())!;
    const detail = (await row.getByText("40 plates").boundingBox())!;
    expect(detail.y).toBeGreaterThan(title.y + title.height - 1);
  });
});

// Search inside text (#350), behind the Programs | Everything toggle.

const LAMB_BOOK = {
  title: "Lamb potjie for 40",
  plates: [40],
  ingredients: [
    {
      name: "Lamb shoulder",
      category: "protein",
      quantity: 8,
      unit: "kg",
      allergens: [],
    },
  ],
  steps: [
    {
      instruction:
        "Brown the lamb in the big pot on the second gas burner, in small batches so it sears and never stews.",
    },
  ],
};

test.describe("Ctrl+K: Programs | Everything, and search inside text (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("Programs asks the server nothing; Ctrl+K switches to Everything, which is remembered after a reload", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the shortcut is a keyboard's; the phone taps");
    await invitedMember(page, request, "tx-cook", "Tx Cook");
    const seeded = await request.post("/api/test/seed-kitchen-book", {
      data: { authUserId: "tx-cook", recipes: [POT_BOOK] },
    });
    expect(seeded.ok()).toBe(true);
    await asRank(page, request, "tx-member", "member");
    const asked = searchRequests(page);

    await pressCtrlK(page);
    await expect(scopeRadio(page, "Programs")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const input = searchBox(page).getByRole("combobox");
    await input.fill("pow");
    await expect(result(page, /^Power, Program/)).toBeVisible();
    // A search word finds Power too, and says which.
    await input.fill("fuel");
    await expect(
      result(page, /^Power, Program, Fuel cans, Power and Lighting/),
    ).toBeVisible();
    await input.fill("pot");
    await expect(result(page, /^Search everything for “pot”/)).toBeVisible();
    // Past the debounce, and still nothing asked.
    await page.waitForTimeout(600);
    expect(asked).toEqual([]);

    // Ctrl+K inside the box switches; the recipe comes from the server.
    await page.keyboard.press("Control+k");
    await expect(searchBox(page)).toBeVisible();
    await expect(scopeRadio(page, "Everything")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(searchBox(page).getByRole("status")).toContainText(
      "Everything: programs, recipes, chapters, meetings and more.",
    );
    await expect(result(page, /^Potjiekos for 40, Recipe/)).toBeVisible();
    expect(asked.some((u) => u.includes("q=pot"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(searchBox(page)).toHaveCount(0);

    // Remembered in this browser.
    await page.reload();
    await expectDesktop(page);
    await pressCtrlK(page);
    await expect(scopeRadio(page, "Everything")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test('the "Search everything" row hands the words over', async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the same row on a phone");
    await invitedMember(page, request, "tx-row-cook", "Row Cook");
    const seeded = await request.post("/api/test/seed-kitchen-book", {
      data: { authUserId: "tx-row-cook", recipes: [POT_BOOK] },
    });
    expect(seeded.ok()).toBe(true);
    await asRank(page, request, "tx-row", "member");
    await pressCtrlK(page);
    await searchBox(page).getByRole("combobox").fill("potjie");
    const row = result(page, /^Search everything for “potjie”/);
    await expect(row).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(scopeRadio(page, "Everything")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(result(page, /^Potjiekos for 40, Recipe/)).toBeVisible();
  });

  test("a word only in a recipe's method finds it, says where, and opens it; a suggestion's text is not searched", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the phone's line is the same row, below");
    // A recipe proofread but not yet in the book, whose version holds the
    // word, and a recipe in the book whose method holds it too.
    await invitedMember(page, request, "tx-suggester", "Tx Suggester");
    const seeded = await request.post("/api/test/seed-kitchen-book", {
      data: {
        authUserId: "tx-suggester",
        recipes: [
          LAMB_BOOK,
          {
            ...LAMB_BOOK,
            title: "Skottel bread",
            inBook: false,
            steps: [
              { instruction: "Bake on the skottel; it sears the crust." },
            ],
          },
        ],
      },
    });
    expect(seeded.ok()).toBe(true);

    await asRank(page, request, "tx-reader", "member");
    await typeSearch(page, "sears");
    const hit = result(
      page,
      /^Lamb potjie for 40, Recipe, 40 plates, found in the method: /,
    );
    // Present first, then the absence.
    await expect(hit).toBeVisible();
    await expect(hit).toContainText("in the method");
    await expect(hit.locator("mark")).toHaveText(["sears"]);
    await expect(result(page, /^Skottel bread,/)).toHaveCount(0);
    await expect(hit).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(searchBox(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/kitchen\/recipes\/[0-9a-f-]{36}$/);
    await expect(
      liveWindow(page).getByRole("heading", {
        level: 1,
        name: "Lamb potjie for 40",
      }),
    ).toBeVisible();
  });
});
