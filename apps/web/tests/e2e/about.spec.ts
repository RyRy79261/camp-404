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

// About Camp 404 (#264, test-mode): the camp's intro, once a Notion page.
// Every approved member opens it from the Camp menu and reads it; a lead of a
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
    await expect(
      page.getByRole("link", { name: "Edit these words" }),
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
      page.getByRole("link", { name: "Edit these words" }),
    ).toHaveCount(0);

    await page.goto("/captains/join-site");
    await expect(
      page.getByRole("heading", { name: "Join site" }),
    ).toBeVisible();
    await expect(page.getByText("Captain access only")).toBeVisible();
    await expect(page.getByRole("form", { name: "Map" })).toHaveCount(0);
  });

  test("a captain edits the words in Join site, and a member reads them", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "about-captain");
    await setRank(request, "about-captain", "captain");
    await page.goto("/about");
    await expect(heading(page)).toBeVisible();
    await page.getByRole("link", { name: "Edit these words" }).click();
    await expect(page).toHaveURL(/\/captains\/join-site$/);

    const map = page.getByRole("form", { name: "Map" });
    await map.getByLabel("Where (on the map)").fill("Block 7 · Street B");
    await map.getByRole("button", { name: "Save map" }).click();
    await expect(page.getByText("Map saved.", { exact: false })).toBeVisible();

    await approvedMember(page, request, "about-reader");
    await page.goto("/about");
    await expect(heading(page)).toBeVisible();
    await expect(page.getByText("Block 7 · Street B")).toBeVisible();
  });
});
