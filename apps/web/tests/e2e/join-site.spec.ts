import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";
import { usesPhoneLayout } from "./lib/console-nav";
import { openJoinSection } from "./lib/join-site";

// The Join site editor and the profile's "What I am in camp" card, through
// the server actions and the E2E test store (lib/join-site.ts's twin).

test.describe("join site editor (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  async function asRank(
    page: Page,
    request: APIRequestContext,
    authUserId: string,
    rank: "captain" | "member",
  ) {
    await login(page, { id: authUserId, email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, authUserId);
    await setRank(request, authUserId, rank);
  }

  test("a non-captain sees the locked shell, no editor", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "join-member", "member");
    await page.goto("/captains/join-site");
    await expect(
      page.getByRole("heading", { name: "Join site" }),
    ).toBeVisible();
    await expect(page.getByText("Captain access only")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Sections" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save page" })).toHaveCount(
      0,
    );
  });

  test("a captain changes two sections, saves once, and both persist", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "join-captain", "captain");
    await page.goto("/captains/join-site");
    // A desktop opens on the first section; a phone opens on the list.
    await expect(
      usesPhoneLayout(page)
        ? page
            .getByRole("navigation", { name: "Sections" })
            .getByRole("button", { name: /^Who we are/ })
            .filter({ visible: true })
        : page.getByRole("heading", { level: 2, name: "Who we are" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("No changes");

    await openJoinSection(page, "Where we are");
    const where = page.getByLabel("Where we are on the map");
    await expect(where).toHaveValue("Block 3/4-ish · Street A");
    await where.fill("Block 7 · Street B");

    await openJoinSection(page, "How to join");
    await page.getByLabel("Button", { exact: true }).fill("JOIN US");
    await expect(page.getByRole("status")).toHaveText(
      "2 sections not saved: Where we are, How to join",
    );

    await page.getByRole("button", { name: "Save page" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Saved. About and join.camp-404.com show the new words.",
    );

    await page.reload();
    await openJoinSection(page, "Where we are");
    await expect(page.getByLabel("Where we are on the map")).toHaveValue(
      "Block 7 · Street B",
    );
    await openJoinSection(page, "How to join");
    await expect(page.getByLabel("Button", { exact: true })).toHaveValue(
      "JOIN US",
    );
  });

  test("a captain sees what they typed wrong beside the section, and nothing saves", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "join-captain-bad", "captain");
    await page.goto("/captains/join-site");

    await openJoinSection(page, "The crew");
    await page.getByLabel("Smallest camp that can run").fill("80");
    await page.getByRole("button", { name: "Save page" }).click();
    await expect(
      page
        .getByRole("alert")
        .getByText("The minimum cannot be more than the full camp."),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(
      "Not saved. The crew: Smallest camp that can run: The minimum cannot be more than the full camp.",
    );

    await page.reload();
    await openJoinSection(page, "The crew");
    await expect(page.getByLabel("Smallest camp that can run")).toHaveValue(
      "30",
    );
  });

  test("a captain adds a schedule line in its table, and About reads it", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "join-captain-sched", "captain");
    await page.goto("/captains/join-site");
    await openJoinSection(page, "What you put in");
    await page
      .getByRole("button", { name: "Add a line on site" })
      .filter({ visible: true })
      .click();
    if (usesPhoneLayout(page)) {
      // On a phone the new line opens in its own small form.
      const line = page.getByRole("dialog", { name: "Line 5" });
      await line.getByLabel("When").fill("28 April");
      await line.getByLabel("What happens").fill("Lamp-lighting walk.");
      await line.getByRole("button", { name: "Done" }).click();
    } else {
      await page.getByLabel("When, On site, Line 5").fill("28 April");
      await page
        .getByLabel("What happens, On site, Line 5")
        .fill("Lamp-lighting walk.");
    }
    await page.getByRole("button", { name: "Save page" }).click();
    await expect(page.getByRole("status")).toHaveText(/^Saved\./);

    await page.goto("/about");
    await expect(
      page
        .getByRole("list", { name: "On site" })
        .getByText("Lamp-lighting walk."),
    ).toBeVisible();
  });

  test("the Burn's dates wait for the camp's year", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "join-captain-year", "captain");
    await page.goto("/captains/join-site");
    await openJoinSection(page, "What you put in");
    await expect(
      page.getByRole("link", { name: "Name this year in Camp settings" }),
    ).toBeVisible();
    await expect(page.getByLabel("First day")).toHaveCount(0);
  });

  test("a captain writes their blurb and switches on the join site; a member has no switch", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "blurb-captain", "captain");
    await page.goto("/profile/edit");
    const form = page.getByRole("form", { name: "What I am in camp" });
    await form
      .getByLabel("Title", { exact: true })
      .fill("The Original Error Code");
    await form
      .getByLabel("Blurb", { exact: true })
      .fill("Consistently entropic.");
    await form.getByRole("switch").click();
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.reload();
    const again = page.getByRole("form", { name: "What I am in camp" });
    await expect(again.getByLabel("Title", { exact: true })).toHaveValue(
      "The Original Error Code",
    );
    await expect(again.getByRole("switch")).toBeChecked();

    await setRank(request, "blurb-captain", "member");
    await page.reload();
    const asMember = page.getByRole("form", { name: "What I am in camp" });
    await expect(asMember.getByLabel("Title", { exact: true })).toBeVisible();
    await expect(asMember.getByRole("switch")).toHaveCount(0);
  });
});
