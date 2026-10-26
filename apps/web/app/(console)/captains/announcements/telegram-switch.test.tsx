import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The composer's "Also post in Telegram" (Ol' Jeb, owner's mock-up of
// 2026-10-26): a captain's announcement to everyone, ticked by default,
// naming the chats it goes to. Never offered for a narrower audience, or when
// there is no chat to post in.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({
  deleteDraftAction: vi.fn(),
  previewPublishAction: vi.fn(),
  publishAction: vi.fn(),
  saveDraftAction: vi.fn(async () => ({ ok: true, data: { id: "a-1" } })),
  setPinnedAction: vi.fn(),
  updateDraftAction: vi.fn(),
}));
vi.mock("@/components/voice/use-voice-recorder", () => ({
  useVoiceSupported: () => false,
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { DraftWindow } from "@/tests/draft-window";
import { saveDraftAction } from "./actions";
import { AnnouncementsManager } from "./announcements-manager";

function composer(telegramChats: string[], preferredAudience?: string) {
  render(
    <DraftWindow windowKey="announcements">
      <AnnouncementsManager
        currentUserId="me"
        audienceOptions={[
          { value: "everyone", label: "The whole camp" },
          { value: "team:kitchen", label: "Kitchen" },
        ]}
        teamLabels={{ kitchen: "Kitchen" }}
        leadTeams={null}
        announcements={[]}
        preferredAudience={preferredAudience}
        telegramChats={telegramChats}
      />
    </DraftWindow>,
  );
}

const telegramSwitch = () =>
  screen.queryByRole("switch", { name: "Also post in Telegram" });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("Also post in Telegram", () => {
  it("is ticked by default, names the chats, and goes with the draft", async () => {
    composer(["Camp 404 Announcements", "Camp 404 › Announcements"]);
    const sw = telegramSwitch()!;
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByText(/in Camp 404 Announcements, Camp 404 › Announcements\./),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Water run" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Bring bottles." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));
    await waitFor(() => expect(saveDraftAction).toHaveBeenCalled());
    expect(vi.mocked(saveDraftAction).mock.calls[0]![0]).toMatchObject({
      telegram: true,
    });
  });

  it("is not offered with no chat, or for a team", () => {
    composer([]);
    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(telegramSwitch()).toBeNull();
    cleanup();
    composer(["Camp 404 Announcements"], "team:kitchen");
    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(telegramSwitch()).toBeNull();
  });
});
