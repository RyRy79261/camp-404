import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Camp settings' Ol' Jeb card: the chats he posts in, Remove, the three ticks
// and how to add a chat. A failed one-tap change is a toast, and the tick goes
// back.

const actions = vi.hoisted(() => ({
  setTelegramPostsAction: vi.fn(),
  removeTelegramPlaceAction: vi.fn(),
}));
vi.mock(
  "@/app/(console)/captains/camp-settings/telegram-actions",
  () => actions,
);
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { OlJebCard } from "../ol-jeb-card";

const POSTS = { announcements: true, reminders: true, meetings: true };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OlJebCard", () => {
  it("lists the chats and the topic, and says how to add one", () => {
    render(
      <OlJebCard
        bot="jebediah_404_bot"
        posts={POSTS}
        places={[
          { id: "a", title: "Camp 404 Announcements", topic: false },
          { id: "b", title: "Camp 404 › Announcements", topic: true },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Chats Ol' Jeb posts in" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("group")).toBeTruthy();
    expect(within(list).getByText("topic")).toBeTruthy();
    expect(screen.getByText("/notifyhere@jebediah_404_bot")).toBeTruthy();
  });

  it("says no chat yet, with no list", () => {
    render(<OlJebCard bot="jebediah_404_bot" posts={POSTS} places={[]} />);
    expect(screen.getByText("No chats yet")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("removes a chat and refreshes", async () => {
    actions.removeTelegramPlaceAction.mockResolvedValue({ ok: true });
    render(
      <OlJebCard
        bot="jebediah_404_bot"
        posts={POSTS}
        places={[{ id: "a", title: "Camp 404 Announcements", topic: false }]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    });
    expect(actions.removeTelegramPlaceAction).toHaveBeenCalledWith("a");
    expect(refresh).toHaveBeenCalled();
  });

  it("saves a tick, and puts it back with a toast when the save fails", async () => {
    actions.setTelegramPostsAction.mockResolvedValueOnce({ ok: true });
    actions.setTelegramPostsAction.mockResolvedValueOnce({
      ok: false,
      error: "Only a captain can change where Ol' Jeb posts.",
    });
    render(<OlJebCard bot="jebediah_404_bot" posts={POSTS} places={[]} />);
    const meetings = screen.getByRole("checkbox", {
      name: "New meetings in the Calendar",
    });
    await act(async () => {
      fireEvent.click(meetings);
    });
    expect(actions.setTelegramPostsAction).toHaveBeenCalledWith({
      ...POSTS,
      meetings: false,
    });
    expect(meetings.getAttribute("aria-checked")).toBe("false");
    const reminders = screen.getByRole("checkbox", {
      name: "Questionnaire reminders, tagging who still has to answer",
    });
    await act(async () => {
      fireEvent.click(reminders);
    });
    expect(toast.error).toHaveBeenCalled();
    expect(reminders.getAttribute("aria-checked")).toBe("true");
  });
});
