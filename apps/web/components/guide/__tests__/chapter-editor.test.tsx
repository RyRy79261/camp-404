import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

// The editor's Write and Preview (owner, 2026-10-01): on a phone they are two
// tabs; from a medium window up both show side by side (the page-md classes),
// and the preview is the reader's own rendering of the chapter.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/app/(console)/guide/actions", () => ({
  createGuideChapterAction: vi.fn(),
  publishGuideChapterAction: vi.fn(),
  saveGuideChapterAction: vi.fn(),
  setGuideChapterPublicAction: vi.fn(),
  unpublishGuideChapterAction: vi.fn(),
}));

import { ChapterEditor } from "../chapter-editor";

afterEach(cleanup);

function editor(markdown = "## Labels\n\nName and **date**.") {
  return render(
    <ChapterEditor
      mode={{
        kind: "edit",
        slug: "fridge-rules",
        version: 3,
        published: true,
        everPublished: true,
        changedSincePublish: false,
        public: false,
      }}
      initial={{
        kind: "chapter",
        title: "Fridge rules",
        category: "kitchen",
        team: "kitchen",
        markdown,
        card: null,
      }}
      teams={[{ value: "kitchen", label: "Kitchen" }]}
      canPickWholeCamp={false}
      canSetPublic={false}
    />,
  );
}

const shown = (el: HTMLElement) =>
  el.className.split(/\s+/).includes("flex") &&
  !el.className.split(/\s+/).includes("hidden");

describe("the guide editor's Write and Preview", () => {
  it("opens on Write, and the Preview tab swaps the two on a phone", () => {
    editor();
    const write = screen.getByTestId("write-panel");
    const preview = screen.getByTestId("preview-panel");
    expect(
      screen.getByRole("radio", { name: "Write" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(shown(write)).toBe(true);
    expect(shown(preview)).toBe(false);
    // From a medium window up both show anyway.
    expect(preview.className).toContain("page-md:flex");

    fireEvent.click(screen.getByRole("radio", { name: "Preview" }));
    expect(shown(write)).toBe(false);
    expect(shown(preview)).toBe(true);
    expect(write.className).toContain("page-md:flex");

    fireEvent.click(screen.getByRole("radio", { name: "Write" }));
    expect(shown(write)).toBe(true);
  });

  it("hides the tabs from a medium window up", () => {
    editor();
    expect(
      screen.getByRole("radiogroup", { name: "Write or preview" }).className,
    ).toContain("page-md:hidden");
  });

  it("previews the chapter as members read it, not as Markdown", () => {
    editor();
    const preview = screen.getByTestId("preview-panel");
    expect(
      within(preview).getByRole("heading", { name: "Labels" }),
    ).toBeTruthy();
    expect(within(preview).getByText("date").tagName).toBe("STRONG");
    expect(preview.textContent).not.toContain("##");
  });

  it("says there is nothing to preview for an empty chapter", () => {
    editor("");
    expect(
      within(screen.getByTestId("preview-panel")).getByText(
        "Nothing to show yet. Start writing and it appears here.",
      ),
    ).toBeTruthy();
  });
});
