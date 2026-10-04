import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
  setGuideChapterMembersOnlyAction: vi.fn(),
  unpublishGuideChapterAction: vi.fn(),
}));

import { toast } from "@camp404/ui/components/toast";
import { setGuideChapterMembersOnlyAction } from "@/app/(console)/guide/actions";
import { ChapterEditor } from "../chapter-editor";

afterEach(cleanup);

function editor(
  markdown = "## Labels\n\nName and **date**.",
  {
    publicSections = [] as string[],
    membersOnly = false,
    live = null as { version: number; day: string } | null,
    canSetMembersOnly = false,
  } = {},
) {
  return render(
    <ChapterEditor
      mode={{
        kind: "edit",
        slug: "fridge-rules",
        version: 3,
        published: true,
        everPublished: true,
        changedSincePublish: false,
        membersOnly,
        liveSectionPublic: live ? publicSections.includes("kitchen") : null,
        liveMembersOnlyParts: 1,
        live,
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
      canSetMembersOnly={canSetMembersOnly}
      publicSections={publicSections}
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
    // The tabs' bar is sticky on a phone and gone from a medium window up.
    const bar = screen.getByRole("radiogroup", {
      name: "Write or preview",
    }).parentElement!;
    expect(bar.className).toContain("page-md:hidden");
    expect(bar.className).toContain("sticky");
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

// The public site (#250): the editor says where a publish goes, boxes a
// Members only part, and previews the draft as the public will see it.
describe("the guide editor and the public site", () => {
  const WITH_PART =
    "Labels on everything.\n\n:::members\nThe fridge code is CANARY-1.\n:::\n\nShut the lid.";

  it("warns beside Publish when the topic is a public section", () => {
    editor(WITH_PART, { publicSections: ["kitchen"] });
    expect(screen.getByTestId("publish-goes-public").textContent).toBe(
      "PublicPublishing puts this draft on survival-guide.camp-404.com straight away. The Members only part stays in the app.",
    );
  });

  it("says nothing of the site in a private section, or for a chapter kept members only", () => {
    editor(WITH_PART);
    expect(screen.queryByTestId("publish-goes-public")).toBeNull();
    cleanup();
    editor(WITH_PART, { publicSections: ["kitchen"], membersOnly: true });
    expect(screen.queryByTestId("publish-goes-public")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Who can read it" }).textContent,
    ).toContain("this chapter is kept members only");
  });

  it("boxes a Members only part in the members' preview and cuts it in the public one", () => {
    editor(WITH_PART, {
      publicSections: ["kitchen"],
      live: { version: 3, day: "28 September 2026" },
    });
    const preview = screen.getByTestId("preview-panel");
    expect(
      within(preview).getByRole("region", { name: "Members only" }).textContent,
    ).toContain("CANARY-1");
    const region = screen.getByRole("region", { name: "Who can read it" });
    expect(region.textContent).toContain(
      "Live there now: version 3, published 28 September 2026, with 1 members-only part left out.",
    );
    fireEvent.click(
      within(region).getByRole("button", {
        name: "Preview this draft as the public will see it",
      }),
    );
    expect(preview.textContent).not.toContain("CANARY-1");
    expect(preview.textContent).toContain("Shut the lid.");
    expect(within(preview).getByTestId("members-gap").textContent).toBe(
      "There is more here for camp members. Read it in the app.",
    );
  });

  it("lets only a captain tick Keep this whole chapter members only", () => {
    editor();
    expect(
      screen
        .getByRole("checkbox", { name: "Keep this whole chapter members only" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("frees the mark again and says so when the request fails", async () => {
    vi.mocked(setGuideChapterMembersOnlyAction).mockRejectedValueOnce(
      new Error("offline"),
    );
    editor(undefined, { canSetMembersOnly: true });
    const box = screen.getByRole("checkbox", {
      name: "Keep this whole chapter members only",
    });
    fireEvent.click(box);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(box.hasAttribute("disabled")).toBe(false);
    expect(box.getAttribute("aria-checked")).toBe("false");
  });
});
