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
  setRank,
} from "./_helpers";

// The Survival Guide's public site, from inside the app (#250, test-mode). A
// captain writes a chapter with a "Members only" part (the toolbar button),
// the reader boxes it, and the editor says where a publish goes. On the
// contents grouped by topic the captain turns a section on: the dialog names
// what goes out and what stays members only; turning it off asks nothing. A
// plain member sees the state but no switch. The public site itself has its
// own e2e (apps/guide/tests/e2e).

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

async function newChapter(page: Page, title: string, topic: string) {
  await page.goto("/guide/new");
  await expect(
    page.getByRole("heading", { level: 1, name: "New chapter" }),
  ).toBeVisible();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("combobox", { name: "Topic" }).click();
  await page.getByRole("option", { name: topic }).click();
}

test.describe("survival guide: the public site's switches (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a captain keeps part of a chapter for members and puts its section on the public site", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await approvedMember(page, request, "gps-captain", "Cap Tain");
    await setRank(request, "gps-captain", "captain");

    // A chapter whose second paragraph is a Members only part.
    await newChapter(page, "Getting to the Tankwa", "Before you come");
    const text = page.getByRole("textbox", { name: "The chapter" });
    await text.click();
    await page.keyboard.type("The drive is part of the burn.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("The convoy meets at Ceres.");
    await page.getByRole("button", { name: "Members only" }).click();
    await expect(
      page.getByRole("button", { name: "Members only" }),
    ).toHaveAttribute("aria-pressed", "true");
    const preview = page.getByTestId("preview-panel");
    await expect(
      preview.getByRole("region", { name: "Members only" }),
    ).toContainText("The convoy meets at Ceres.");
    // The section is private: nothing is said about the site yet.
    await expect(page.getByTestId("publish-goes-public")).toHaveCount(0);
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Getting to the Tankwa" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Members only" }),
    ).toContainText("The convoy meets at Ceres.");

    // A second chapter in the same section, kept members only.
    await newChapter(page, "Gate codes", "Before you come");
    await page.getByRole("textbox", { name: "The chapter" }).click();
    await page.keyboard.type("Ask a captain.");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Gate codes" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Edit" }).click();
    await page
      .getByRole("checkbox", { name: "Keep this whole chapter members only" })
      .click();
    await expect(page.getByText("Kept for members only")).toBeVisible();

    // Turning the section on asks first, naming what goes out.
    await page.goto("/guide");
    const section = page.getByRole("region", { name: "Before you come" });
    await expect(section).toContainText("Members only · 2 chapters");
    await expect(
      section
        .getByRole("listitem")
        .filter({ hasText: "Getting to the Tankwa" }),
    ).toContainText("Has a members-only part");
    await expect(
      section.getByRole("listitem").filter({ hasText: "Gate codes" }),
    ).toContainText("Members only");
    await section
      .getByRole("switch", { name: "Before you come on the public site" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Make Before you come public?",
    });
    await expect(dialog).toContainText(
      "1 chapter goes on survival-guide.camp-404.com now:",
    );
    await expect(dialog.getByRole("list", { name: "Goes public" })).toHaveText(
      "Getting to the Tankwa",
    );
    await expect(dialog).toContainText("Gate codes stays members only.");
    await dialog.getByRole("button", { name: "Make public" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(section).toContainText("On the public site · 1 of 2 chapters");
    await expect(
      page.getByRole("link", { name: "Survival Guide site" }),
    ).toHaveAttribute("href", "https://survival-guide.camp-404.com");

    // The editor now says it is live, and that a publish goes out at once.
    await page.goto("/guide/getting-to-the-tankwa/edit");
    await expect(
      page.getByRole("region", { name: "Who can read it" }),
    ).toContainText("with 1 members-only part left out.");
    await expect(page.getByTestId("publish-goes-public")).toContainText(
      "Publishing puts this draft on survival-guide.camp-404.com straight away. The Members only part stays in the app.",
    );

    // A plain member sees which sections are public, and no switch.
    await approvedMember(page, request, "gps-member", "Mo Member");
    await page.goto("/guide");
    const seen = page.getByRole("region", { name: "Before you come" });
    await expect(seen).toContainText("On the public site");
    await expect(page.getByRole("switch")).toHaveCount(0);

    // Off is a kill switch, with no question.
    await login(page, {
      id: "gps-captain",
      email: "gps-captain@example.com",
      displayName: "Cap Tain",
    });
    await page.goto("/guide");
    await page
      .getByRole("region", { name: "Before you come" })
      .getByRole("switch", { name: "Before you come on the public site" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Before you come" }),
    ).toContainText("Members only · 2 chapters");
  });
});
