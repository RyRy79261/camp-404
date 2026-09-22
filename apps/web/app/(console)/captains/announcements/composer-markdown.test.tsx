import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnnouncementSummary } from "@camp404/db/broadcasts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({
  deleteDraftAction: vi.fn(),
  previewPublishAction: vi.fn(),
  publishAction: vi.fn(),
  saveDraftAction: vi.fn(),
  setPinnedAction: vi.fn(),
  updateDraftAction: vi.fn(),
}));
vi.mock("@/components/voice/use-voice-recorder", () => ({
  useVoiceSupported: () => false,
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { AnnouncementsManager } from "./announcements-manager";

// The composer stays a plain Textarea — that is what keeps the dictation pill
// appending into it — so a captain needs two things to write markdown with
// any confidence: to be told it is supported, and to see what it becomes.

function renderComposer(announcements: AnnouncementSummary[] = []) {
  return render(
    <AnnouncementsManager
      currentUserId="me"
      audienceOptions={[{ value: "everyone", label: "The whole camp" }]}
      teamLabels={{}}
      leadTeams={null}
      announcements={announcements}
    />,
  );
}

function preview(): HTMLElement | null {
  const kicker = screen.queryByText("Preview");
  return kicker ? (kicker.parentElement as HTMLElement) : null;
}

describe("the announcement composer", () => {
  it("says markdown is supported, and says it to a screen reader too", () => {
    renderComposer();
    const body = screen.getByLabelText("Message");
    expect(screen.getByText(/Markdown supported/)).toBeTruthy();
    const describedBy = body.getAttribute("aria-describedby");
    expect(describedBy).toBe("announcement-body-hint");
    expect(document.getElementById(describedBy!)?.textContent).toMatch(
      /Markdown supported/,
    );
  });

  it("keeps the body a plain textarea, so dictation still appends into it", () => {
    renderComposer();
    expect(screen.getByLabelText("Message").tagName).toBe("TEXTAREA");
  });

  it("shows no preview until there is something to preview", () => {
    renderComposer();
    expect(preview()).toBeNull();
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "   " },
    });
    expect(preview()).toBeNull();
  });

  it("renders the typed markdown as the member will read it", () => {
    renderComposer();
    fireEvent.change(screen.getByLabelText("Message"), {
      target: {
        value: "## Burn night\n\n**Everyone** meets at 20:00.\n\n- Water",
      },
    });
    const panel = within(preview()!);
    expect(
      panel.getByRole("heading", { name: "Burn night", level: 2 }),
    ).toBeTruthy();
    expect(preview()!.querySelector("strong")?.textContent).toBe("Everyone");
    expect(preview()!.querySelectorAll("li")).toHaveLength(1);
  });

  it("updates as the captain types", () => {
    renderComposer();
    const body = screen.getByLabelText("Message");
    fireEvent.change(body, { target: { value: "**first**" } });
    expect(preview()!.querySelector("strong")?.textContent).toBe("first");
    fireEvent.change(body, { target: { value: "**second**" } });
    expect(preview()!.querySelector("strong")?.textContent).toBe("second");
  });

  it("leaves a list card plain, markers and all stripped", () => {
    renderComposer([
      {
        id: "d1",
        title: "Burn night briefing",
        body: "## Burn night\n\n**Everyone** meets at 20:00.",
        presentation: "feed",
        pinnedAt: null,
        audience: { scope: "everyone" },
        senderId: "me",
        senderName: "Me",
        publishedAt: null,
        createdAt: new Date("2026-09-01T10:00:00Z"),
        recipientCount: 0,
        acknowledgedCount: 0,
        readCount: 0,
      },
    ]);
    const card = screen
      .getByRole("heading", { name: "Burn night briefing" })
      .closest("li")!;
    expect(card.querySelector("h2")).toBeNull();
    expect(card.querySelector("strong")).toBeNull();
    expect(card.textContent).toContain("Everyone meets at 20:00.");
    expect(card.textContent).not.toContain("**");
    expect(card.textContent).not.toContain("##");
  });
});
