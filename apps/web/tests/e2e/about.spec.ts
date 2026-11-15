import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedTeam,
  setRank,
} from "./_helpers";
import { goViaConsoleNav } from "./lib/console-nav";
import { openJoinSection } from "./lib/join-site";

// About Camp 404 (#264, test-mode): the camp's intro, once a Notion page.
// Every approved member opens it from the Camp menu and reads it, the Notion
// page's words in its sections (Caitlin, 2026-11-15); a lead of a
// team is refused the editor like any non-captain; a captain edits its words
// in the Join site program, and the member then reads the new words.

async function approvedMember(
  page: Page,
  request: APIRequestContext,
  id: string,
) {
  await login(page, { id, email: `${id}@example.com`, displayName: id });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

const heading = (page: Page) =>
  page.getByRole("heading", { level: 1, name: "About Camp 404" });

test.describe("About Camp 404 (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member opens it from the Camp menu and reads it, with no way to edit", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "about-member");
    await page.goto("/");
    await goViaConsoleNav(page, "About Camp 404", "Camp");
    await expect(page).toHaveURL(/\/about$/);
    await expect(heading(page)).toBeVisible();
    await expect(
      page.getByText("Camp 404 is not appropriate for children", {
        exact: false,
      }),
    ).toBeVisible();
    // The Notion page's sections, by its own names, with its highlights.
    await expect(
      page.getByRole("region", { name: "Responsibilities - What You Put In" }),
    ).toBeVisible();
    await expect(
      page.locator("mark", {
        hasText: "Camp members are encouraged to arrive no later than",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Edit in Join site" }),
    ).toHaveCount(0);
  });

  test("a lead of a team is not offered the editor, and it refuses them", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "about-lead");
    await seedTeam(request, "about-lead", "kitchen", true);
    await page.goto("/about");
    await expect(heading(page)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Edit in Join site" }),
    ).toHaveCount(0);

    await page.goto("/captains/join-site");
    await expect(
      page.getByRole("heading", { name: "Join site" }),
    ).toBeVisible();
    await expect(page.getByText("Captain access only")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Sections" }),
    ).toHaveCount(0);
  });

  test("a captain edits the words in Join site, and a member reads them", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "about-captain");
    await setRank(request, "about-captain", "captain");
    await page.goto("/about");
    await expect(heading(page)).toBeVisible();
    await page.getByRole("link", { name: "Edit in Join site" }).click();
    await expect(page).toHaveURL(/\/captains\/join-site$/);

    await openJoinSection(page, "About Camp 404");
    const where = page.getByRole("textbox", {
      name: "🏕️ Where is 404 in Tankwa Town?",
      exact: true,
    });
    await where.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("We moved to Block 7 · Street B.");
    await page.getByRole("button", { name: "Save page" }).click();
    await expect(
      page.getByText("Saved. About and join.camp-404.com show the new words."),
    ).toBeVisible();

    await approvedMember(page, request, "about-reader");
    await page.goto("/about");
    await expect(heading(page)).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Where is 404 in Tankwa Town?" })
        .getByText("We moved to Block 7 · Street B."),
    ).toBeVisible();
  });
});
