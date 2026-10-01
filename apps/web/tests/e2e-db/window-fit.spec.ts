import { test, expect, type Locator } from "@playwright/test";
import { resetTestState } from "../e2e/_helpers";
import {
  tableFrameTop,
  expectBeside,
  expectFits,
  expectStacked,
  expectSticksInWindow,
  NARROW,
  openWindow,
  resizeWindowTo,
  WIDE,
  WIDEST,
} from "../e2e/lib/window-fit";
import {
  answerGate,
  buildAndPublish,
  sendBlockingToEveryone,
  signInCaptain,
} from "./_flows";

// Windows fit their own width (PR E of the 404 OS console plan), for the
// pages that need the questionnaire engine: the builder and a
// questionnaire's results. On a 1440px screen, so a page laid out by the
// SCREEN's width would keep its wide layout in a 470px window. The rest are
// in tests/e2e/window-fit.spec.ts.

const FIT = {
  title: "Shade check",
  key: "shade-check",
  prompt: "Are you bringing shade cloth?",
};

test("the builder and a questionnaire's results fit their window", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const captain = await signInCaptain(browser, request, "fit-db-captain");
  await captain.setViewportSize({ width: 1440, height: 900 });
  await buildAndPublish(captain, FIT);

  // The builder: the palette above the questionnaire in a narrow window
  // (its entries two a row), beside it in a wide one (one a row); a
  // question's prompt and its type one per row, then side by side.
  let win = await openWindow(
    captain,
    `/captains/questionnaires/${FIT.key}`,
    /^(Edit|Build a) questionnaire$/,
  );
  const palette = win.getByRole("complementary", { name: "Add a block" });
  const details = win.getByText("Details", { exact: true });
  const content = palette.getByRole("group", { name: "Content" });
  const [first, second] = [
    content.getByRole("button").nth(0),
    content.getByRole("button").nth(1),
  ];
  const prompt = win.getByLabel("Question prompt");
  const type = win.getByRole("combobox", { name: "Block type" });

  await resizeWindowTo(captain, win, NARROW);
  await expectFits(win);
  await expectStacked(palette, details);
  await expectBeside(first, second);
  await expectStacked(prompt, type);

  await resizeWindowTo(captain, win, WIDEST);
  await expectFits(win);
  await expectBeside(palette, details);
  await expectStacked(first, second);
  await expectBeside(prompt, type);

  // Full screen, the palette may be as tall as the window's body less its
  // top gap and the save bar: not capped by the height the window had
  // before (which the frame keeps, to restore to).
  await win.getByRole("button", { name: /^Full screen / }).click();
  await expect(win).toHaveAttribute("data-maximized", "true");
  const body = win.locator("[data-window-body]");
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect
    .poll(() =>
      palette.evaluate((el) => {
        const scroller = el.closest<HTMLElement>("[data-window-body]")!;
        const rem = parseFloat(
          getComputedStyle(document.documentElement).fontSize,
        );
        return Math.round(
          scroller.clientHeight -
            7 * rem -
            parseFloat(getComputedStyle(el).maxHeight),
        );
      }),
    )
    .toBe(0);
  const saveBar = win.getByRole("button", { name: "Save draft" }).locator("..");
  const [paletteBox, barBox] = [
    (await palette.boundingBox())!,
    (await saveBar.boundingBox())!,
  ];
  expect(paletteBox.y + paletteBox.height).toBeLessThanOrEqual(barBox.y);
  await win.getByRole("button", { name: /^Restore / }).click();

  // Results: someone answers first.
  await sendBlockingToEveryone(captain, FIT.title);
  await answerGate(captain, { ...FIT, text: "Two sheets" });

  // The summary: the completion rate above its bar, then beside it.
  win = await openWindow(
    captain,
    `/captains/questionnaires/${FIT.key}/metrics`,
    FIT.title,
  );
  const rate = win.getByText(/^\d+%$/);
  const bar = win.getByRole("progressbar", { name: "Completion" });
  await resizeWindowTo(captain, win, NARROW);
  await expectFits(win);
  await expectStacked(rate, bar);
  await resizeWindowTo(captain, win, WIDEST);
  await expectFits(win);
  await expectBeside(rate, bar);

  // Individual answers: a card per member in a narrow window, a framed
  // table in a wide one.
  await captain
    .getByRole("radiogroup", { name: "Results view" })
    .getByRole("radio", { name: "Individual" })
    .click();
  await expect(captain).toHaveURL(/\/responses\?cycle=/);
  win = captain.locator("section[data-window]:has(#os-window-content)");
  const answers: Locator = win.locator('[data-slot="responsive-data-table"]');
  await expect(answers).toBeVisible();
  await resizeWindowTo(captain, win, NARROW);
  await expectFits(win);
  await expect(win.getByRole("table", { name: "Answers" })).toBeHidden();
  await expect.poll(() => tableFrameTop(answers)).toBe(0);
  await resizeWindowTo(captain, win, WIDE);
  await expectFits(win);
  await expect(win.getByRole("table", { name: "Answers" })).toBeVisible();
  await expect.poll(() => tableFrameTop(answers)).toBe(1);

  await captain.context().close();
});

test("the invite form sticks to the top of its window", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const captain = await signInCaptain(browser, request, "fit-db-inviter");
  await captain.setViewportSize({ width: 1440, height: 900 });
  // Enough codes that the list runs well past the form beside it (the test
  // store keeps no invite list, so this runs on the database).
  for (let i = 0; i < 24; i++) {
    const res = await request.post("/api/test/seed-invite", {
      data: {
        code: `fit-sticky-${String(i).padStart(2, "0")}`,
        note: "Shade crew",
      },
    });
    expect(res.ok()).toBe(true);
  }

  const win = await openWindow(captain, "/tools/invite", "Invite a member");
  await resizeWindowTo(captain, win, WIDEST);
  await expectFits(win);
  const form = win.getByRole("heading", { level: 2, name: "New invite code" });
  const list = win.locator("#invite-list-heading");
  await expectBeside(list, form);
  await expectSticksInWindow(form);

  await captain.context().close();
});
