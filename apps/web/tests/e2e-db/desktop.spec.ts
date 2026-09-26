import { test, expect, type Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
} from "../e2e/_helpers";
import {
  desktopIcon,
  expectDesktop,
  osWindow,
  startButton,
  taskbar,
  taskbarWindow,
} from "../e2e/lib/console-nav";
import {
  answerGate,
  buildAndPublish,
  sendBlockingToEveryone,
  signInCaptain,
} from "./_flows";

// The 404 OS desktop where it needs the questionnaire engine (PR C), which
// the in-memory store cannot run: a member held by a blocking questionnaire
// sees the form on top of an inert desktop, on a hard load and mid-session;
// and the builder's unsaved changes are asked about before its window gives
// way to another. The rest of the desktop is tests/e2e/os-shell.spec.ts.

const CHECK = {
  title: "Tent check",
  key: "tent-check",
  prompt: "Which tent are you bringing?",
};
/** A second blocking form, so answering the first lands on a held /complete. */
const CHECK2 = {
  title: "Bike check",
  key: "bike-check",
  prompt: "Are you bringing a bike?",
};

/** The blocking layer: the form on top of everything, named by its title. */
function requiredForm(page: Page) {
  return page.getByRole("dialog", { name: CHECK.title });
}

/** The pinned strip above the taskbar. */
function pinned(page: Page) {
  return page.getByRole("region", { name: "Pinned announcements" });
}

/** The held desktop: the form on top, nothing live behind it. */
async function expectHeld(page: Page) {
  const layer = requiredForm(page);
  await expect(layer).toBeVisible();
  await expect(
    layer.getByRole("heading", { level: 1, name: CHECK.title }),
  ).toBeVisible();
  await expect(page.locator("#os-desktop")).toHaveAttribute("inert", "");
  // One way out: the layer's Sign out, not a second one from the page.
  await expect(layer.getByRole("link", { name: "Sign out" })).toHaveCount(1);
  // No taskbar buttons, tray, pins or counts: the bar is drawn empty. (The
  // member has a pin: it was on their desktop before the hold.)
  await expect(taskbar(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Notifications/ }),
  ).toHaveCount(0);
  await expect(pinned(page)).toHaveCount(0);
  // Esc stays in the form (the layer's unit test pins that it never reaches
  // the desktop): focus is still inside it afterwards.
  await page.keyboard.press("Escape");
  await expect(layer).toBeVisible();
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest("[data-os-blocking]"),
    ),
  ).toBe(true);
}

/** The captain publishes a quiet announcement to everyone and pins it. */
async function publishAndPin(captain: Page, title: string) {
  await captain.goto("/captains/announcements");
  await captain.getByLabel("Title").fill(title);
  await captain.getByLabel("Message").fill("Behind the kitchen now.");
  await captain.getByLabel("How it lands").click();
  await captain.getByRole("option", { name: /Quiet/ }).click();
  await captain.getByRole("button", { name: "Save draft" }).click();
  await captain.getByRole("button", { name: "Publish to camp" }).click();
  await captain
    .getByRole("dialog")
    .getByRole("button", { name: /^Publish to \d+ members?$/ })
    .click();
  await expect(captain.getByText(/Published to \d+ members?/)).toBeVisible();
  const card = captain.getByRole("listitem").filter({ hasText: title });
  await card.getByRole("button", { name: "Pin to top" }).click();
  await expect(captain.getByText("Pinned to the top")).toBeVisible();
}

test("a member held by a blocking questionnaire: mid-session, then on a hard load", async ({
  browser,
  request,
}) => {
  await resetTestState(request);

  // A member, signed in and on their desktop before anything is sent.
  const member = await (await browser.newContext()).newPage();
  await login(member, {
    id: "db-held",
    email: "held@example.com",
    displayName: "Hel Held",
  });
  await redeemInviteAtGate(member, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(member).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, "db-held");
  await member.goto("/");
  await expectDesktop(member);
  const roster = desktopIcon(member, "Roster");
  await expect(roster).toBeVisible();

  // A captain pins an announcement: the member's desktop shows it (present
  // first, so its absence while held means something).
  const captain = await signInCaptain(browser, request);
  await publishAndPin(captain, "Water points moved");
  await member.goto("/");
  await expectDesktop(member);
  await expect(pinned(member).getByText("Water points moved")).toBeVisible();

  // Then sends two blocking questionnaires to everyone (answering each
  // itself, as it is held too).
  await buildAndPublish(captain, CHECK);
  await buildAndPublish(captain, CHECK2);
  await sendBlockingToEveryone(captain, CHECK.title);
  await answerGate(captain, { ...CHECK, text: "A dome tent" });
  await sendBlockingToEveryone(captain, CHECK2.title);
  await answerGate(captain, { ...CHECK2, text: "Yes" });

  // Mid-session: the member's next click is sent to the runner by the
  // server, and the desktop draws it on top, the rest inert.
  await roster.dblclick();
  await expect(member).toHaveURL(/\/questionnaires\/[0-9a-f-]{36}$/, {
    timeout: 60_000,
  });
  await expectHeld(member);
  // The icons behind the form cannot be reached: they sit in the inert
  // desktop (a pointer lands on the layer over them).
  const heldAt = member.url();
  expect(await roster.evaluate((el) => !!el.closest("[inert]"))).toBe(true);

  // The inbox (a push or email link) is no form: it is drawn bare, with no
  // layer over it and no desktop behind it, as before the desktop.
  await member.goto("/notifications");
  await expect(
    member.getByRole("heading", { level: 1, name: "Notifications" }),
  ).toBeVisible();
  await expect(member.getByRole("dialog")).toHaveCount(0);
  await expect(member.locator("#os-desktop")).toHaveCount(0);

  // A hard load: the layout draws the held desktop itself.
  await member.goto(heldAt);
  await expectHeld(member);
  await member.goto("/");
  await expect(member).toHaveURL(heldAt);
  await expectHeld(member);

  // The first answered: its completion page, still held by the second, is
  // in the layer too, with the layer's one Sign out and none of its own.
  await answerGate(member, { ...CHECK, text: "A bell tent" });
  const done = member.getByRole("dialog", { name: "Questionnaire complete" });
  await expect(done).toBeVisible();
  await expect(member.locator("#os-desktop")).toHaveAttribute("inert", "");
  await expect(done.getByRole("link", { name: "Sign out" })).toHaveCount(1);

  // Both answered, the desktop is the member's again.
  await member.goto("/");
  await answerGate(member, { ...CHECK2, text: "No" });
  await member.goto("/");
  await expectDesktop(member);
  await expect(member.locator("#os-desktop")).not.toHaveAttribute("inert", "");
  await expect(startButton(member)).toBeVisible();
  await expect(requiredForm(member)).toHaveCount(0);

  await member.context().close();
  await captain.context().close();
});

test("the builder asks before its window gives way with unsaved changes", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const captain = await signInCaptain(browser, request);

  // A second window to switch to.
  await captain.goto("/captains/camp-management");
  await expect(
    captain.getByRole("heading", { level: 1, name: "Camp management" }),
  ).toBeVisible();
  await captain.goto("/captains/questionnaires");
  await captain.getByRole("button", { name: "New questionnaire" }).click();
  await captain.getByLabel("Questionnaire name").fill("Unsaved thing");
  await captain.getByRole("button", { name: "Create", exact: true }).click();
  await expect(captain).toHaveURL(
    /\/captains\/questionnaires\/unsaved-thing$/,
    {
      timeout: 60_000,
    },
  );
  await expect(osWindow(captain, "Edit questionnaire")).toBeVisible();

  // An unsaved edit.
  await captain
    .getByRole("complementary", { name: "Add a block" })
    .getByRole("button", { name: "Short answer", exact: true })
    .click();
  await captain.getByLabel("Question prompt").fill("Not saved yet");

  // Switching away asks; "stay" keeps the builder and the edit.
  const asked: string[] = [];
  captain.once("dialog", (d) => {
    asked.push(d.message());
    void d.dismiss();
  });
  await taskbarWindow(captain, "Roster").click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toMatch(/not saved/);
  await expect(captain).toHaveURL(/\/captains\/questionnaires\/unsaved-thing$/);
  await expect(captain.getByLabel("Question prompt")).toHaveValue(
    "Not saved yet",
  );

  // "Leave" goes.
  captain.once("dialog", (d) => void d.accept());
  await taskbarWindow(captain, "Roster").click();
  await expect(captain).toHaveURL("/captains/camp-management");
  await expect(
    captain.getByRole("heading", { level: 1, name: "Camp management" }),
  ).toBeVisible();

  await captain.context().close();
});
