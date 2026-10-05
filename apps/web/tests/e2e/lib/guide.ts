import { expect, type Locator, type Page } from "@playwright/test";
import { usesPhoneLayout } from "./console-nav";

// The Survival Guide's chapter editor. From a medium window up, Write and
// Preview sit side by side; on a phone they are two tabs ("Write or
// preview"), and the preview pane is hidden until its tab is chosen.

/**
 * The editor's preview pane, shown: on a phone this presses the Preview tab
 * first, as a member would.
 */
export async function showPreview(page: Page): Promise<Locator> {
  if (usesPhoneLayout(page)) {
    const tab = page
      .getByRole("radiogroup", { name: "Write or preview" })
      .getByRole("radio", { name: "Preview" });
    await tab.click();
    await expect(tab).toBeChecked();
  }
  return page.getByTestId("preview-panel");
}
