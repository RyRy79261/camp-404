import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";
import { bottomBar, expectDesktop, homeScreen } from "./lib/console-nav";
import { desktopOnly } from "./lib/dom";

// Voice to instruction (#356), on the test store with a fake transcriber and
// a scripted Claude (lib/voice/claude-fake.ts): the scripts read the camp
// through the connector's real tools, and every list, run and result after
// that is the production code. Chromium's fake microphone records the clip.
//
// VOICE_SHOTS=1 also saves the screenshots compared with the mock-up
// (camp404-night/voice/built-*.png).

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

const SHOTS = process.env.VOICE_SHOTS === "1";
const SHOT_DIR = "/home/ryan/camp404-night/voice";
async function shot(page: Page, name: string, clip?: Locator) {
  if (!SHOTS) return;
  await (clip ?? page).screenshot({ path: `${SHOT_DIR}/built-${name}.png` });
}

test.beforeEach(async ({ request }) => {
  await resetTestState(request);
});

async function asCaptain(page: Page, request: APIRequestContext, id: string, consent: boolean) {
  await login(page, { id, email: "god@example.com", displayName: "Ryno Steyn" });
  await page.goto("/");
  await completeOnboarding(request, id);
  await setRank(request, id, "captain");
  const res = await request.post("/api/test/voice", {
    data: { authUserId: id, seed: true, consent, script: "three" },
  });
  expect(res.ok()).toBe(true);
}

async function asMember(page: Page, request: APIRequestContext, id: string) {
  await login(page, { id, email: "god@example.com", displayName: "Mo Member" });
  await page.goto("/");
  await completeOnboarding(request, id);
  await setRank(request, id, "member");
}

const panel = (page: Page) => page.getByRole("dialog", { name: "Voice" });
const mic = (page: Page) => page.locator("[data-voice-mic]");

async function speak(page: Page, start: Locator, stop: Locator) {
  await start.click();
  await expect(panel(page).getByText("Listening")).toBeVisible();
  await page.waitForTimeout(600);
  await stop.click();
}

test.describe("voice on the desktop", () => {
  test("a member has no mic; a captain's sits under Today, and runs a list of three with one refused", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the desktop's mic under the Today gadget");
    await page.setViewportSize({ width: 1280, height: 800 });

    await asMember(page, request, "voice-member");
    await page.goto("/");
    await expectDesktop(page);
    await expect(page.getByRole("button", { name: /^(Show|Hide) Today/ })).toBeVisible();
    await expect(mic(page)).toHaveCount(0);

    await asCaptain(page, request, "voice-captain", false);
    await page.goto("/");
    await expectDesktop(page);
    const handle = page.getByRole("button", { name: /^(Show|Hide) Today/ });
    await expect(handle).toBeVisible();
    await expect(mic(page)).toBeVisible();
    // Flush with the right edge, 12 px under the tab.
    const m = (await mic(page).boundingBox())!;
    const tab = (await handle.locator("span").first().boundingBox())!;
    expect(Math.round(m.x + m.width)).toBe(1280);
    expect(Math.round(m.y - (tab.y + tab.height))).toBe(12);
    await shot(page, "desk-closed");

    // Today open: the mic sits under the card.
    await handle.click();
    const card = page.getByRole("complementary", { name: "Today", exact: true });
    await expect(card).toBeVisible();
    // Once it has slid in: flush with the edge, under the card.
    await expect
      .poll(async () => {
        const b = (await mic(page).boundingBox())!;
        return Math.round(b.x + b.width);
      })
      .toBe(1280);
    const c = (await card.boundingBox())!;
    const m2 = (await mic(page).boundingBox())!;
    expect(m2.y).toBeGreaterThanOrEqual(c.y + c.height);
    await shot(page, "desk-open");
    await handle.click();

    // The one-time notice, then the recording.
    await mic(page).click();
    await expect(panel(page).getByText(/sent to Groq to become words/)).toBeVisible();
    await panel(page).getByRole("button", { name: "Turn on voice" }).click();
    await panel(page).getByRole("button", { name: "Start speaking" }).click();
    await expect(panel(page).getByText("Listening")).toBeVisible();
    await shot(page, "recording");
    await page.waitForTimeout(600);
    await panel(page).getByRole("button", { name: "Stop and send" }).click();

    // Three actions, each in the server's own words, and the answer on top.
    const list = panel(page);
    await expect(list.getByText(/Here is what I'll do · 3 of 3/)).toBeVisible();
    await expect(list.getByText("Sign you up for Breakfast cooks, Wed 28 Apr 07:00–09:00")).toBeVisible();
    await expect(list.getByText("Move “Buy 30 m of shade cloth” from Doing to Done")).toBeVisible();
    await expect(list.getByText(/Say you can help on Build, Thu 22 Apr – Sun 25 Apr/)).toBeVisible();
    await expect(list.getByText(/build-week planning call/i)).toBeVisible();
    await expect(list.getByRole("button", { name: /Do 3 actions/ })).toBeEnabled();
    await shot(page, "confirm-3");

    // Someone moves the task before Do: that one is refused, the others run.
    await request.post("/api/test/voice", { data: { authUserId: "voice-captain", moveTask: "done" } });
    await list.getByRole("button", { name: /Do 3 actions/ }).click();
    await expect(list.getByText(/2 done, 1 not done/)).toBeVisible();
    await expect(list.locator('[data-voice-result="done"]')).toHaveCount(2);
    await expect(list.locator('[data-voice-result="not_done"]')).toContainText("Someone else moved this task");
    await shot(page, "results");

    // Did you mean: two breakfast shifts fit; untick one, and Do 2. (The
    // task goes back to Doing first.)
    await request.post("/api/test/voice", {
      data: { authUserId: "voice-captain", script: "ask", moveTask: "in_progress" },
    });
    await list.getByRole("button", { name: /Say something else/ }).click();
    await expect(list.getByText("Listening")).toBeVisible();
    await page.waitForTimeout(600);
    await list.getByRole("button", { name: "Stop and send" }).click();
    await expect(list.getByText("Which breakfast shift on Wednesday?")).toBeVisible();
    await expect(list.getByText(/Waiting, shown with this one before anything runs/)).toBeVisible();
    await shot(page, "did-you-mean");
    await list.locator('[data-voice-choice="2"]').click();
    await expect(list.getByText(/Here is what I'll do · 3 of 3/)).toBeVisible();
    await expect(list.getByText(/Breakfast wash-up, Wed 28 Apr/)).toBeVisible();
    await list.locator('[data-voice-row="3"]').click();
    await expect(list.getByRole("checkbox", { name: /^3\./ })).not.toBeChecked();
    await expect(list.getByRole("button", { name: /Do 2 actions/ })).toBeVisible();
    await list.getByRole("button", { name: /Do 2 actions/ }).click();
    await expect(list.locator('[data-voice-result="unticked"]')).toHaveCount(1);

    // Esc closes it, and focus is back on the mic.
    await list.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(mic(page)).toBeFocused();
  });
});

test.describe("voice on a phone", () => {
  for (const width of [390, 360]) {
    test(`at ${width} px: the captain's bar ends with Voice then the clock, Prince stays on the clock, and the sheet lists the actions`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await asMember(page, request, `voice-member-${width}`);
      await page.goto("/");
      await expectDesktop(page);
      const bar = bottomBar(page);
      await expect(bar.getByRole("button", { name: "Home" })).toBeVisible();
      const cells = () =>
        bar.locator("> *").evaluateAll((els) =>
          els.map((el) =>
            el.hasAttribute("data-phone-clock")
              ? "clock"
              : el.hasAttribute("data-phone-voice")
                ? "voice"
                : (el.getAttribute("aria-label")?.split(",")[0] ?? "bell"),
          ),
        );
      expect(await cells()).toEqual(["Home", "Search", "bell", "Today", "clock"]);
      await expect(bar.locator("[data-phone-voice]")).toHaveCount(0);
      if (width === 390) await shot(page, "phone-member");

      await asCaptain(page, request, `voice-captain-${width}`, true);
      await page.goto("/");
      await expectDesktop(page);
      await expect(bar.getByRole("button", { name: "Home" })).toBeVisible();
      expect(await cells()).toEqual(["Home", "Search", "bell", "Today", "voice", "clock"]);

      // Prince lies inside the clock's edges; the mic ends before the clock.
      const clock = (await bar.locator("[data-phone-clock]").boundingBox())!;
      expect(clock.width).toBeGreaterThanOrEqual(60);
      const prince = page.locator('[data-phone-clock] [data-cat="prince"]');
      await expect(prince).toBeVisible();
      const cat = (await prince.boundingBox())!;
      expect(cat.x).toBeGreaterThanOrEqual(clock.x);
      expect(cat.x + cat.width).toBeLessThanOrEqual(clock.x + clock.width);
      const voiceCell = (await bar.locator("[data-phone-voice]").boundingBox())!;
      expect(voiceCell.x + voiceCell.width).toBeLessThan(clock.x);
      expect(voiceCell.width).toBeGreaterThanOrEqual(44);
      // His pet bubble sits above the mic, never over it.
      await prince.click({ force: true });
      const bubble = page.locator(".cat-bubble");
      await expect(bubble).toBeVisible();
      const b = (await bubble.boundingBox())!;
      expect(b.y + b.height).toBeLessThan(voiceCell.y);
      if (width === 390) await shot(page, "phone-captain");

      // Voice: the sheet over the bar, recording; Stop; the list.
      await bar.locator("[data-phone-voice]").click();
      await expect(panel(page).getByText("Listening")).toBeVisible();
      await expect(bar.locator("[data-phone-voice]")).toHaveText(/Stop/);
      await page.waitForTimeout(600);
      await bar.locator("[data-phone-voice]").click();
      await expect(panel(page).getByText(/Here is what I'll do · 3 of 3/)).toBeVisible();
      await expect(panel(page).getByRole("button", { name: /Do 3 actions/ })).toBeVisible();
      if (width === 390) await shot(page, "phone-voice");
      await panel(page).getByRole("button", { name: /^Cancel/ }).click();
      await expect(panel(page)).toHaveCount(0);
      await expect(homeScreen(page)).toBeVisible();
    });
  }
});
