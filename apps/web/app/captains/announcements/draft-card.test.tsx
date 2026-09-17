import { render, screen, within } from "@testing-library/react";
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
  updateDraftAction: vi.fn(),
}));
vi.mock("@/components/voice/use-voice-recorder", () => ({
  useVoiceSupported: () => false,
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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
