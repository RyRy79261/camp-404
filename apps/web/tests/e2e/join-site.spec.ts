import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";

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
    await expect(page.getByRole("form", { name: "Map" })).toHaveCount(0);
  });

  test("a captain opens on the approved copy, saves a section, and it persists", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "join-captain", "captain");
    await page.goto("/captains/join-site");

    const map = page.getByRole("form", { name: "Map" });
    const where = map.getByLabel("Where (on the map)");
    await expect(where).toHaveValue("Block 3/4-ish · Street A");

    await where.fill("Block 7 · Street B");
    await map.getByRole("button", { name: "Save map" }).click();
    await expect(page.getByText("Map saved.", { exact: false })).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("form", { name: "Map" }).getByLabel("Where (on the map)"),
    ).toHaveValue("Block 7 · Street B");
  });

  test("a captain sees what they typed wrong beside the section", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "join-captain-bad", "captain");
    await page.goto("/captains/join-site");

    const crew = page.getByRole("form", { name: "Crew" });
    await crew.getByLabel("Minimum to run").fill("80");
    await crew.getByRole("button", { name: "Save crew" }).click();
    await expect(
      crew.getByText("The minimum cannot be more than the full camp."),
    ).toBeVisible();
  });

  test("the Burn's dates wait for the camp's year", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "join-captain-year", "captain");
    await page.goto("/captains/join-site");
    await expect(page.getByText(/Name the camp's year first/)).toBeVisible();
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
