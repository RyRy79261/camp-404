import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnouncementSummary } from "@camp404/db/broadcasts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({
  deleteDraftAction: vi.fn(),
  previewPublishAction: vi.fn(),
  publishAction: vi.fn(),
  saveDraftAction: vi.fn(),
  updateDraftAction: vi.fn(),
}));
vi.mock("@/components/voice/use-voice-recorder", () => ({
  useVoiceSupported: () => false,
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { deleteDraftAction, previewPublishAction } from "./actions";
import { AnnouncementsManager } from "./announcements-manager";

// A captain sees every draft, but only the author may change one: the server
// refuses anyone else's edit, delete or publish.

function draft(
  overrides: Partial<AnnouncementSummary> & { id: string; title: string },
): AnnouncementSummary {
  return {
    body: "Body text",
    presentation: "feed",
    audience: { scope: "everyone" },
    senderId: "me",
    senderName: "Me",
    publishedAt: null,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    recipientCount: 0,
    acknowledgedCount: 0,
    readCount: 0,
    ...overrides,
  };
}

function cardFor(title: string) {
  return screen.getByRole("heading", { name: title }).closest("li")!;
}

describe("DraftCard", () => {
  it("gives the author the buttons and names another captain's draft", () => {
    render(
      <AnnouncementsManager
        currentUserId="me"
        audienceOptions={[{ value: "everyone", label: "The whole camp" }]}
        teamLabels={{}}
        announcements={[
          draft({ id: "d1", title: "My draft" }),
          draft({
            id: "d2",
            title: "Their draft",
            senderId: "other",
            senderName: "Grace",
          }),
        ]}
      />,
    );

    const mine = within(cardFor("My draft"));
    expect(mine.getByRole("button", { name: /Edit/ })).toBeTruthy();
    expect(mine.getByRole("button", { name: /Delete/ })).toBeTruthy();
    expect(mine.getByRole("button", { name: /Publish to camp/ })).toBeTruthy();

    const theirs = within(cardFor("Their draft"));
    expect(theirs.queryByRole("button")).toBeNull();
    expect(theirs.getByText(/by Grace/)).toBeTruthy();
  });
});

describe("draft actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderTwoDrafts() {
    return render(
      <AnnouncementsManager
        currentUserId="me"
        audienceOptions={[{ value: "everyone", label: "The whole camp" }]}
        teamLabels={{}}
        announcements={[
          draft({ id: "d1", title: "First" }),
          draft({ id: "d2", title: "Second" }),
        ]}
      />,
    );
  }

  it("spins only the tapped button and holds every other write", async () => {
    let finish!: (value: { ok: true; data: undefined }) => void;
    vi.mocked(deleteDraftAction).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
    );
    renderTwoDrafts();
    const first = within(cardFor("First"));
    const second = within(cardFor("Second"));

    fireEvent.click(first.getByRole("button", { name: /Delete/ }));

    await waitFor(() =>
      expect(
        first
          .getByRole("button", { name: /Delete/ })
          .querySelector(".animate-spin"),
      ).not.toBeNull(),
    );
    expect(
      first
        .getByRole("button", { name: /Publish to camp/ })
        .querySelector(".animate-spin"),
    ).toBeNull();
    expect(
      second
        .getByRole("button", { name: /Delete/ })
        .querySelector(".animate-spin"),
    ).toBeNull();
    expect(second.getByRole("button", { name: /Delete/ })).toHaveProperty(
      "disabled",
      true,
    );

    finish({ ok: true, data: undefined });
    await waitFor(() =>
      expect(second.getByRole("button", { name: /Delete/ })).toHaveProperty(
        "disabled",
        false,
      ),
    );
  });

  it("reports a failed delete or publish as a toast, not in the composer", async () => {
    vi.mocked(deleteDraftAction).mockResolvedValue({
      ok: false,
      error: "That draft is gone.",
    } as never);
    vi.mocked(previewPublishAction).mockResolvedValue({
      ok: false,
      error: "Pick an active team.",
    } as never);
    renderTwoDrafts();
    const first = within(cardFor("First"));

    fireEvent.click(first.getByRole("button", { name: /Delete/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That draft is gone."),
    );
    // The buttons stay disabled until the failed delete has settled.
    await waitFor(() =>
      expect(
        first.getByRole("button", { name: /Publish to camp/ }),
      ).toHaveProperty("disabled", false),
    );
    fireEvent.click(first.getByRole("button", { name: /Publish to camp/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Pick an active team."),
    );
    expect(screen.queryByText("That draft is gone.")).toBeNull();
  });

  it("puts the cursor in the title when a draft is opened for editing", async () => {
    renderTwoDrafts();
    fireEvent.click(
      within(cardFor("Second")).getByRole("button", { name: /Edit/ }),
    );
    const title = screen.getByLabelText("Title");
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(title).toHaveProperty("value", "Second");
  });

  it("ties the delivery hint to the delivery picker", () => {
    renderTwoDrafts();
    const hint = document.getElementById("announcement-presentation-hint");
    expect(hint?.textContent).toMatch(/Takes over each member's screen/);
    expect(
      screen
        .getByRole("combobox", { name: "How it lands" })
        .getAttribute("aria-describedby"),
    ).toBe("announcement-presentation-hint");
  });
});
