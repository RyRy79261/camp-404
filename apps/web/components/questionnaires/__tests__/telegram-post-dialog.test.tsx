import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// "Post in Telegram" on a sent questionnaire (owner's mock-up, 2026-10-27):
// the chips tick who can be tagged, a connected member starts unticked, one
// with no username cannot be ticked, and Post sends ids, never handles.

const actions = vi.hoisted(() => ({
  telegramPostDialogAction: vi.fn(),
  postInTelegramAction: vi.fn(),
}));
vi.mock("@/app/(console)/captains/questionnaires/actions", () => actions);
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { TelegramPostButton } from "../telegram-post-dialog";

const person = (
  userId: string,
  name: string,
  over: Record<string, unknown> = {},
) => ({
  userId,
  name,
  intent: null,
  status: null,
  mention: `@${userId}_404`,
  connected: false,
  ...over,
});

const DIALOG = {
  title: "Coming this year?",
  body: "Tell us if you're coming.",
  candidates: [
    person("cloud", "Cloud"),
    person("mike", "Mike", { intent: "maybe", status: "maybe" }),
    person("cait", "Caitlin", { intent: "yes", status: "applied" }),
    person("sam", "Sam", { connected: true }),
    person("alex", "Alex", { mention: null }),
  ],
  places: [
    { id: "p1", title: "Camp 404 Announcements", topic: false },
    { id: "p2", title: "Camp 404 › Announcements", topic: true },
  ],
};

async function openDialog() {
  actions.telegramPostDialogAction.mockResolvedValue({
    ok: true,
    dialog: DIALOG,
  });
  actions.postInTelegramAction.mockResolvedValue({ ok: true, message: "ok" });
  render(<TelegramPostButton activationId="act-1" title="Coming this year?" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Post Coming this year? in Telegram" }),
  );
  await screen.findByText("Tell us if you're coming.");
}

const box = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLButtonElement;
const ticked = (name: string) =>
  box(name).getAttribute("data-state") === "checked";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Post in Telegram", () => {
  it("starts with everyone who has not answered ticked, but not a connected member", async () => {
    await openDialog();
    expect(
      screen
        .getByRole("button", { name: /Hasn't answered \(5\)/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(ticked("Cloud")).toBe(true);
    expect(ticked("Mike")).toBe(true);
    expect(ticked("Caitlin")).toBe(true);
    expect(ticked("Sam")).toBe(false);
    expect(screen.getByText("connected · gets a DM")).toBeTruthy();
    expect(box("Alex").disabled).toBe(true);
    expect(screen.getByText("no Telegram username")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Post now · tags 3 people" }),
    ).toBeTruthy();
  });

  it("ticks a chip's people, and Nobody ticks none", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: /Said Maybe \(1\)/ }));
    expect(ticked("Mike")).toBe(true);
    expect(ticked("Cloud")).toBe(false);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Said Coming, hasn't answered \(1\)/,
      }),
    );
    expect(ticked("Caitlin")).toBe(true);
    expect(ticked("Mike")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Nobody" }));
    expect(
      screen.getByRole("button", { name: "Post now · tags 0 people" }),
    ).toBeTruthy();
  });

  it("posts the picked ids, chats and the private-message choice", async () => {
    await openDialog();
    fireEvent.click(box("Sam"));
    fireEvent.click(box("Mike"));
    fireEvent.click(screen.getByRole("checkbox", { name: /topic/ }));
    fireEvent.click(
      box("Also send a private message to members who connected Telegram"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Post now · tags 3 people" }),
    );
    await waitFor(() =>
      expect(actions.postInTelegramAction).toHaveBeenCalledWith({
        activationId: "act-1",
        tagUserIds: expect.arrayContaining(["cloud", "cait", "sam"]),
        placeIds: ["p1"],
        messageConnected: false,
      }),
    );
    const sent = actions.postInTelegramAction.mock.calls[0]![0];
    expect(sent.tagUserIds).toHaveLength(3);
  });

  it("shows the server's refusal and keeps the dialog open", async () => {
    await openDialog();
    actions.postInTelegramAction.mockResolvedValue({
      ok: false,
      error: "This send is closed, so there is nothing to post.",
    });
    fireEvent.click(screen.getByRole("button", { name: /Post now/ }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This send is closed, so there is nothing to post.",
    );
  });
});
