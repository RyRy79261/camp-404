import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The composer's unsaved words (the four editors' rule, design doc section
// 5): kept for this tab when the window goes, restored with Discard,
// forgotten once saved as a draft. Read back, an audience the sender may no
// longer pick becomes the first they may.

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

import { draftStorageKey } from "@/components/os/window-storage";
import { DRAFT_OWNER, DraftWindow } from "@/tests/draft-window";
import { saveDraftAction } from "./actions";
import { AnnouncementsManager } from "./announcements-manager";

const KEY = draftStorageKey(DRAFT_OWNER, "announcements", "announcement");

function composer() {
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
      />
    </DraftWindow>,
  );
}

const title = () => screen.getByLabelText("Title") as HTMLInputElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("the composer's unsaved draft", () => {
  it("keeps it when the window goes, and restores it with Discard", () => {
    composer();
    fireEvent.change(title(), { target: { value: "Water run" } });
    cleanup();
    expect(JSON.parse(window.sessionStorage.getItem(KEY)!)).toMatchObject({
      editingId: null,
      title: "Water run",
    });

    composer();
    expect(title().value).toBe("Water run");
    expect(screen.getByText("Unsaved changes restored.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(title().value).toBe("");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("gives an audience the sender may no longer pick the first they may", () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        editingId: "gone-draft",
        title: "Old words",
        body: "",
        presentation: "feed",
        audience: "team:power",
        pinned: false,
      }),
    );
    composer();
    expect(title().value).toBe("Old words");
    // Not "Edit draft": the draft it edited is not there any more.
    expect(screen.getByText("New announcement")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Who it's for" }).textContent,
    ).toContain("The whole camp");
  });

  it("forgets it once saved as a draft", async () => {
    composer();
    fireEvent.change(title(), { target: { value: "Water run" } });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Bring bottles." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));
    await waitFor(() => expect(saveDraftAction).toHaveBeenCalled());
    await waitFor(() => expect(title().value).toBe(""));
    cleanup();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });
});
