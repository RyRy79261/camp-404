import { test, expect, type Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
} from "./_helpers";

// "Fit your photo" (#276): a member picks a photo, moves it under the round
// frame, saves, and the square that is uploaded is the one they chose. The
// store run stubs the upload route (it echoes a fixed proxy URL), so the cut
// itself is checked on the preview, which is the very blob that was posted.
//
// The test photo is 400×200: its left half red, its right half blue. The old
// silent centre crop cut x 100–300, so its left edge was red. Dragging the
// photo far left moves the square onto the right half: all blue.

const ID = "photo-member";

async function onboard(page: Page) {
  await login(page, { id: ID, email: `${ID}@example.com` });
  await page.goto("/");
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(page.request, ID);
}

/** A 400×200 PNG, red on the left and blue on the right, drawn in the page. */
async function halfAndHalfPng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 200;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(200, 0, 200, 200);
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

/** The colour at (x, y) of an <img>, read at its natural size. */
async function pixelOf(page: Page, selector: string, x: number, y: number) {
  return page.locator(selector).evaluate(
    async (img: HTMLImageElement, [px, py]) => {
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const [r, g, b] = ctx.getImageData(px!, py!, 1, 1).data;
      return { r: r!, g: g!, b: b! };
    },
    [x, y],
  );
}

test.describe("fit your photo", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member moves their photo in the circle, and that square is saved", async ({
    page,
  }) => {
    await onboard(page);
    await page.goto("/profile/edit");
    await expect(
      page.getByRole("button", { name: "Add a profile photo" }),
    ).toBeVisible();

    const png = await halfAndHalfPng(page);
    await page
      .locator('input[type="file"][accept="image/*"]')
      .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });

    const dialog = page.getByRole("dialog", { name: "Fit your photo" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("img", { name: "Preview: your profile" }),
    ).toBeVisible();

    // Drag the photo far to the left: it stops at its edge, no gap.
    const stage = dialog.getByRole("group", { name: "Photo position" });
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Past the frame's edge: the pointer is captured, so the drag goes on.
    await page.mouse.move(box.x - box.width, box.y + box.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    // The keyboard and the zoom controls answer too.
    await stage.focus();
    await page.keyboard.press("+");
    await expect(dialog.getByRole("slider", { name: "Zoom" })).toHaveAttribute(
      "aria-valuenow",
      "120",
    );
    await page.keyboard.press("-");

    const upload = page.waitForResponse("**/api/uploads/avatar");
    await dialog.getByRole("button", { name: "Save photo" }).click();
    expect((await upload).ok()).toBe(true);
    await expect(dialog).toBeHidden();

    // The uploaded square is the right half: blue at its left edge, where the
    // old centre crop was red.
    const preview = 'img[alt="Profile preview"]';
    await expect(page.locator(preview)).toHaveAttribute("src", /^blob:/);
    const left = await pixelOf(page, preview, 8, 256);
    expect(left.b).toBeGreaterThan(200);
    expect(left.r).toBeLessThan(60);

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/profile$/);

    // The stored photo is the uploaded one.
    await page.goto("/profile/edit");
    await expect(page.locator(preview)).toHaveAttribute(
      "src",
      /test-avatar\.webp/,
    );
  });

  test("Cancel keeps the photo the member had", async ({ page }) => {
    await onboard(page);
    await page.goto("/profile/edit");
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      buffer: await halfAndHalfPng(page),
    });
    const dialog = page.getByRole("dialog", { name: "Fit your photo" });
    await expect(dialog).toBeVisible();
    let uploads = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/uploads/avatar")) uploads += 1;
    });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Add a profile photo" }),
    ).toBeVisible();
    expect(uploads).toBe(0);
  });
});
