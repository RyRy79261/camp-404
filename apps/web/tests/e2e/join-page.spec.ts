import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";

// The join page's editor (#264) in Camp settings, on the in-memory test store:
// captains only; the "/" menu and a pasted Markdown page become real headings
// and lists; a picture upload lands in the text; a draft is not published;
// Publish and Take off the join site change what the status says, and every
// change survives a reload. The join site itself (apps/join) is its own app
// and has no Playwright run: its page is covered by unit tests there.

const EDITOR = "/captains/camp-settings/join-page";

async function asRank(
  page: Page,
  request: APIRequestContext,
  authUserId: string,
  rank: "captain" | "member",
) {
  await login(page, { id: authUserId, email: "god@example.com" });
  await page.goto("/"); // lazily creates the camp user row
  await completeOnboarding(request, authUserId);
  await setRank(request, authUserId, rank);
}

function editor(page: Page) {
  return page.getByRole("textbox", { name: /The join page for/ });
}

test.describe("join page editor (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a non-captain sees the locked shell, no editor", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "join-member", "member");
    await page.goto(EDITOR);
    await expect(
      page.getByRole("heading", { name: "Join page" }),
    ).toBeVisible();
    await expect(page.getByText("Captain access only")).toBeVisible();
    await expect(editor(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
  });

  test("a captain writes with the / menu, saves a draft, publishes and takes it down", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "join-captain", "captain");

    // Camp settings links to the editor.
    await page.goto("/captains/camp-settings");
    await page.getByRole("link", { name: "Edit the join page" }).click();
    await expect(page).toHaveURL(EDITOR);
    await expect(page.getByText("Not published")).toBeVisible();

    const box = editor(page);
    await box.click();
    await page.keyboard.type("/head");
    const menu = page.getByRole("listbox", { name: "Insert" });
    await expect(menu.getByRole("option", { name: /Heading/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    await page.keyboard.type("How do I join?");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Apply, then sign up.");
    await expect(box.locator("h2")).toHaveText("How do I join?");
    // The slash and the query went with the command.
    await expect(box).not.toContainText("/head");

    await expect(
      page.getByText("You have changes that aren't saved."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();

    // A draft is not on the join site, and it survives a reload.
    await page.reload();
    await expect(editor(page).locator("h2")).toHaveText("How do I join?");
    await expect(page.getByText("Not published")).toBeVisible();

    // The preview renders the page as the join site does.
    await page.getByRole("radio", { name: "Preview" }).click();
    const preview = page.getByRole("region", { name: "Preview" });
    await expect(
      preview.getByRole("heading", { name: "How do I join?" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "Write" }).click();

    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Published to the join site")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    await expect(
      page.getByText("The join site shows this text."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();

    await page.getByRole("button", { name: "Take off the join site" }).click();
    await page.getByRole("button", { name: "Take it off" }).click();
    await expect(page.getByText("Taken off the join site")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Not published")).toBeVisible();
    // The draft stays.
    await expect(editor(page).locator("h2")).toHaveText("How do I join?");
  });

  test("pasted Markdown becomes headings and lists, and a picture uploads into the text", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "join-paster", "captain");
    await page.goto(EDITOR);
    const box = editor(page);
    await box.click();

    // Notion's "Copy as Markdown" puts the page on the clipboard as text.
    await box.evaluate((el) => {
      const data = new DataTransfer();
      data.setData(
        "text/plain",
        "## The teams\n\n- Kitchen\n- Power and Lighting\n\n**Everyone** joins a team.",
      );
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect(box.locator("h2")).toHaveText("The teams");
    await expect(box.locator("li")).toHaveText([
      "Kitchen",
      "Power and Lighting",
    ]);
    await expect(box.locator("strong")).toHaveText("Everyone");
    await expect(box).not.toContainText("##");

    // A 1x1 PNG. Under E2E the upload stores nothing and answers a link of
    // the stored shape.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    await page.getByLabel("Choose a picture").setInputFiles({
      name: "the-lounge.png",
      mimeType: "image/png",
      buffer: png,
    });
    const img = box.locator("img");
    await expect(img).toHaveAttribute(
      "src",
      "/api/join-image?pathname=join-page%2Fe2e%2Ftest-image.png",
    );
    await expect(img).toHaveAttribute("alt", "the lounge");

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    await page.reload();
    await expect(editor(page).locator("li")).toHaveCount(2);
    await expect(editor(page).locator("img")).toHaveCount(1);
  });
});
