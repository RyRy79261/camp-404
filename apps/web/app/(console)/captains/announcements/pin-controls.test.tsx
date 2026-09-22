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
  setPinnedAction: vi.fn(),
  updateDraftAction: vi.fn(),
}));
vi.mock("@/components/voice/use-voice-recorder", () => ({
  useVoiceSupported: () => false,
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { setPinnedAction } from "./actions";
import { AnnouncementsManager } from "./announcements-manager";

// The pin controls on a published announcement. Two things are being asserted:
// the screen offers a pin exactly where a send would have been allowed (the
// owner's ruling — pinning follows posting), and a failed pin behaves like
// every other one-tap control on a captain screen: a toast, and only the
// control that was used spins.

function sent(
  overrides: Partial<AnnouncementSummary> & { id: string; title: string },
): AnnouncementSummary {
  return {
    body: "Body text",
    presentation: "feed",
    audience: { scope: "everyone" },
    senderId: "me",
    senderName: "Me",
    publishedAt: new Date("2026-09-01T10:00:00Z"),
    pinnedAt: null,
    pinOnPublish: false,
    createdAt: new Date("2026-09-01T09:00:00Z"),
    recipientCount: 3,
    acknowledgedCount: 0,
    readCount: 1,
    ...overrides,
  };
}

function cardFor(title: string) {
  return screen.getByRole("heading", { name: title }).closest("li")!;
}

function renderAs(
  leadTeams: string[] | null,
  announcements: AnnouncementSummary[],
) {
  return render(
    <AnnouncementsManager
      currentUserId="me"
      audienceOptions={[{ value: "everyone", label: "The whole camp" }]}
      teamLabels={{ kitchen: "Kitchen", structures: "Structures" }}
      leadTeams={leadTeams}
      announcements={announcements}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the composer's second axis", () => {
  it("offers 'Keep it at the top' as its own control, beside how it lands", () => {
    renderAs(null, []);
    const toggle = screen.getByRole("switch", { name: "Keep it at the top" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    // The copy has to say it is separate from the presentation, or a captain
    // reads the pin as a fourth, louder way to land.
    const hint = document.getElementById("announcement-pinned-hint");
    expect(hint?.textContent).toMatch(/Separate from how it lands/);
    // ...and that the reader cannot take it down themselves.
    expect(hint?.textContent).toMatch(/can't dismiss it/);

    fireEvent.click(toggle);
    expect(
      screen.getByRole("switch", { name: "Keep it at the top" }).getAttribute("aria-checked"),
    ).toBe("true");
  });
});

describe("a draft keeps its mark", () => {
  // A draft stores only the intent (`pinOnPublish`); `pinnedAt` stays NULL
  // until publish. Reading `pinnedAt` showed a marked draft as unmarked, and
  // the next save then cleared the mark. Seed both sides, so this cannot pass
  // on a constant.
  it.each([
    [true, "true"],
    [false, "false"],
  ] as const)(
    "reopens a draft marked %s with the switch at %s",
    (pinOnPublish, checked) => {
      renderAs(null, [
        sent({
          id: "d1",
          title: "Water run",
          publishedAt: null,
          recipientCount: 0,
          readCount: 0,
          pinOnPublish,
        }),
      ]);
      const card = within(cardFor("Water run"));
      expect(card.queryByText("Will stay at top") !== null).toBe(pinOnPublish);
      fireEvent.click(card.getByRole("button", { name: /Edit/ }));
      expect(
        screen
          .getByRole("switch", { name: "Keep it at the top" })
          .getAttribute("aria-checked"),
      ).toBe(checked);
    },
  );
});

describe("pin controls on a published announcement", () => {
  it("shows a captain a pin on every announcement", () => {
    renderAs(null, [
      sent({ id: "b1", title: "Camp wide" }),
      sent({
        id: "b2",
        title: "Kitchen only",
        audience: { scope: "team", team: "kitchen" },
      }),
    ]);
    expect(
      within(cardFor("Camp wide")).getByRole("button", { name: /Pin to top/ }),
    ).toBeTruthy();
    expect(
      within(cardFor("Kitchen only")).getByRole("button", {
        name: /Pin to top/,
      }),
    ).toBeTruthy();
  });

  it("shows a lead a pin only where they could have posted", () => {
    renderAs(["kitchen"], [
      sent({
        id: "b1",
        title: "Kitchen only",
        audience: { scope: "team", team: "kitchen" },
      }),
      sent({
        id: "b2",
        title: "Structures only",
        audience: { scope: "team", team: "structures" },
      }),
      sent({ id: "b3", title: "Camp wide" }),
    ]);
    // Assert the card that HAS the control first, so the absences below cannot
    // pass against a list that never rendered.
    expect(
      within(cardFor("Kitchen only")).getByRole("button", {
        name: /Pin to top/,
      }),
    ).toBeTruthy();
    for (const title of ["Structures only", "Camp wide"]) {
      expect(
        within(cardFor(title)).queryByRole("button", { name: /Pin/ }),
      ).toBeNull();
    }
  });

  it("says Unpin on one already pinned, and sends the opposite state", async () => {
    vi.mocked(setPinnedAction).mockResolvedValue({ ok: true } as never);
    renderAs(null, [
      sent({
        id: "b1",
        title: "Camp wide",
        pinnedAt: new Date("2026-09-02T08:00:00Z"),
      }),
    ]);
    const card = within(cardFor("Camp wide"));
    expect(card.getByText(/Sitting at the top/)).toBeTruthy();
    fireEvent.click(card.getByRole("button", { name: /Unpin/ }));
    await waitFor(() =>
      expect(setPinnedAction).toHaveBeenCalledWith("b1", false),
    );
    expect(toast.success).toHaveBeenCalledWith("Unpinned");
  });

  it("reports a refused pin as a toast, and spins only that control", async () => {
    let finish!: (value: { ok: false; error: string }) => void;
    vi.mocked(setPinnedAction).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
    );
    renderAs(null, [
      sent({ id: "b1", title: "First" }),
      sent({ id: "b2", title: "Second" }),
    ]);
    const first = within(cardFor("First"));
    const second = within(cardFor("Second"));

    fireEvent.click(first.getByRole("button", { name: /Pin to top/ }));
    await waitFor(() =>
      expect(
        first
          .getByRole("button", { name: /Pin to top/ })
          .querySelector(".animate-spin"),
      ).not.toBeNull(),
    );
    expect(
      second
        .getByRole("button", { name: /Pin to top/ })
        .querySelector(".animate-spin"),
    ).toBeNull();
    expect(second.getByRole("button", { name: /Pin to top/ })).toHaveProperty(
      "disabled",
      true,
    );

    finish({ ok: false, error: "You can only pin to a team you lead." });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "You can only pin to a team you lead.",
      ),
    );
    // The refusal is a toast, never inline in the composer.
    expect(
      screen.queryByText("You can only pin to a team you lead."),
    ).toBeNull();
  });
});
