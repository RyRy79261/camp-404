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

// Camp pets (owner, 2026-10-09; test-mode, on the store's twin,
// lib/test-store-pets.ts). A member sends in their pet with a front and a
// side photo; it waits in their own "Yours" section, photos and all. Another
// member never sees it, and the photo route answers them 404. A captain sees
// it under Waiting with both photos. The four seeded cats are in for
// everyone, each with its picture from the code and no photo; a captain's
// hint on one shows to every member. The reviewer is a captain by rank (owner,
// 2026-10-11), not a FOUNDER_EMAILS address. Marking a pet in (the compare-and-set,
// its audit row and the owner's notice) is covered on PGlite
// (packages/db/src/__tests__/pets.test.ts): every picture in the code is worn
// by a seeded cat today, so here the captain's dialog says none is free.

const CAPTAIN = "pets-captain";

async function approvedMember(
  page: Page,
  request: APIRequestContext,
  id: string,
  displayName: string,
) {
  await login(page, { id, email: `${id}@example.com`, displayName });
  await page.goto("/");
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

/** A plain approved member (no FOUNDER_EMAILS address), made a captain. */
async function captain(page: Page, request: APIRequestContext) {
  await approvedMember(page, request, CAPTAIN, "Cap Tain");
  await setRank(request, CAPTAIN, "captain");
}

async function openPets(page: Page) {
  await page.goto("/pets");
  await expect(
    page.getByRole("heading", { level: 1, name: "Camp pets" }),
  ).toBeVisible();
}

/** A square PNG of one colour, drawn in the page. */
async function png(page: Page, colour: string): Promise<Buffer> {
  const dataUrl = await page.evaluate((fill) => {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 200;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 200, 200);
    return c.toDataURL("image/png");
  }, colour);
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

function card(page: Page, name: string) {
  return page.locator(`[data-testid="pet-card"][data-pet="${name}"]`);
}

async function addPhoto(page: Page, side: "front" | "side", colour: string) {
  await page.getByTestId(`pet-photo-${side}-input`).setInputFiles({
    name: `${side}.png`,
    mimeType: "image/png",
    buffer: await png(page, colour),
  });
  const crop = page.getByRole("dialog", { name: `Fit the ${side} photo` });
  await expect(crop).toBeVisible();
  await crop.getByRole("button", { name: "Save photo" }).click();
  await expect(crop).toBeHidden();
  await expect(
    page.getByRole("button", { name: `Change the ${side} photo` }),
  ).toBeVisible();
}

test.describe("Camp pets", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member sends a pet in; its photos are theirs and the captains' only", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "pets-other", "Oth Er");
    await approvedMember(page, request, "pets-sender", "Sen Der");
    await openPets(page);

    // Every field is asked for, beside the field.
    await page.getByRole("button", { name: "Add your pet" }).click();
    const form = page.getByRole("form", { name: "Add your pet" });
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: "Send" }).click();
    await expect(
      form.getByRole("textbox", { name: "Name", exact: true }),
    ).toHaveAttribute("aria-invalid", "true");
    await expect(
      form.getByRole("button", { name: "Add a photo from the front" }),
    ).toHaveAttribute("aria-invalid", "true");

    await form
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Biscuit");
    await form.getByRole("radio", { name: "Dog" }).click();
    await addPhoto(page, "front", "#ff0000");
    await addPhoto(page, "side", "#0000ff");
    await form
      .getByLabel("One stupid thing about them")
      .fill("Barks at the kettle. Every time.");
    await form.getByRole("button", { name: "Send" }).click();
    await expect(form).toBeHidden();

    // Theirs, first, waiting, with both photos.
    const yours = page.getByRole("list", { name: "Your pets" });
    const biscuit = yours.locator('[data-pet="Biscuit"]');
    await expect(biscuit).toHaveAttribute("data-status", "waiting");
    await expect(biscuit).toContainText("Waiting");
    await expect(biscuit).toContainText("We'll take it from here.");
    await expect(biscuit).toContainText("Barks at the kettle. Every time.");
    const front = biscuit.getByRole("img", { name: "Biscuit from the front" });
    await expect(front).toBeVisible();
    const src = await front.getAttribute("src");
    expect(src).toMatch(/^\/api\/pet-photo\/[^/]+\/front$/);
    expect((await page.request.get(src!)).status()).toBe(200);

    // The seeded cats are in, each with its picture and never a photo.
    const everyone = page.getByRole("list", { name: "Everyone's pets" });
    for (const cat of ["Jinn", "Moda", "Nipster", "Prince"]) {
      const c = everyone.locator(`[data-pet="${cat}"]`);
      await expect(c).toHaveAttribute("data-status", "in");
      await expect(c.getByTestId("pet-portrait")).toBeVisible();
      await expect(c.getByRole("img", { name: /from the/ })).toHaveCount(0);
    }

    // Another member: the cats, never Biscuit, and the photo is a 404.
    await login(page, { id: "pets-other", email: "pets-other@example.com" });
    await openPets(page);
    await expect(card(page, "Jinn")).toBeVisible();
    await expect(card(page, "Biscuit")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark as in" })).toHaveCount(
      0,
    );
    expect((await page.request.get(src!)).status()).toBe(404);

    // A captain: Waiting (1), both photos, and the photo route answers.
    await captain(page, request);
    await openPets(page);
    await page.getByRole("link", { name: "Waiting (1)" }).click();
    await expect(page).toHaveURL(/\/pets\?show=waiting$/);
    const waiting = card(page, "Biscuit");
    await expect(waiting).toContainText("Sent by Sen Der");
    await expect(
      waiting.getByRole("img", { name: "Biscuit from the side" }),
    ).toBeVisible();
    await expect(card(page, "Jinn")).toHaveCount(0);
    expect((await page.request.get(src!)).status()).toBe(200);

    // Every picture in the code is worn, so none is offered.
    await waiting.getByRole("button", { name: "Mark as in" }).click();
    const markIn = page.getByRole("dialog", { name: "Mark Biscuit as in" });
    await expect(markIn).toContainText("No picture is free yet.");
    await markIn.getByRole("button", { name: "Cancel" }).click();
    await expect(markIn).toBeHidden();
  });

  test("a captain's hint is everyone's", async ({ page, request }) => {
    await approvedMember(page, request, "pets-reader", "Rea Der");
    await captain(page, request);
    await openPets(page);

    const jinn = card(page, "Jinn");
    await jinn.getByRole("button", { name: "Add a hint" }).click();
    const dialog = page.getByRole("dialog", { name: "Jinn's hint" });
    await dialog.getByLabel("Hint").fill("Look near the clock after lunch");
    await dialog.getByRole("button", { name: "Save hint" }).click();
    await expect(dialog).toBeHidden();
    await expect(jinn).toContainText("Look near the clock after lunch");

    await login(page, { id: "pets-reader", email: "pets-reader@example.com" });
    await openPets(page);
    const seen = card(page, "Jinn");
    await expect(seen).toContainText("Hint");
    await expect(seen).toContainText("Look near the clock after lunch");
    await expect(seen.getByRole("button", { name: /hint/i })).toHaveCount(0);
  });
});
