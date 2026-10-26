import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const actions = vi.hoisted(() => ({
  createTelegramLinkAction: vi.fn(),
  disconnectTelegramAction: vi.fn(),
  setTelegramNoticesAction: vi.fn(),
  telegramConnectedAction: vi.fn(),
}));
vi.mock("@/app/(console)/profile/telegram-actions", () => actions);
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@camp404/ui/components/toast", () => ({ toast: { error: vi.fn() } }));

import { TelegramCard } from "../telegram-card";

const LINK = "https://t.me/jebediah_404_bot?start=abc";
/** The tab Connect opens (a browser that did not block it). */
let tab: { location: { href: string }; close: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  actions.createTelegramLinkAction.mockResolvedValue({
    ok: true,
    data: { link: LINK },
  });
  actions.telegramConnectedAction.mockResolvedValue({
    ok: true,
    data: { connected: false },
  });
  actions.setTelegramNoticesAction.mockResolvedValue({ ok: true });
  actions.disconnectTelegramAction.mockResolvedValue({ ok: true });
  tab = { location: { href: "" }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TelegramCard", () => {
  it("is Off with a Connect button for a member not connected", () => {
    const { container } = render(
      <TelegramCard connected={false} handle={null} notices="mine" />,
    );
    expect(
      container
        .querySelector("[data-telegram-card]")
        ?.getAttribute("data-telegram-card"),
    ).toBe("off");
    expect(screen.getByText("Off")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Connect Telegram" }),
    ).toBeTruthy();
  });

  it("waits after Connect, with the member's own link to open again", async () => {
    const { container } = render(
      <TelegramCard connected={false} handle={null} notices="mine" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
    await waitFor(() =>
      expect(
        container
          .querySelector("[data-telegram-card]")
          ?.getAttribute("data-telegram-card"),
      ).toBe("waiting"),
    );
    expect(window.open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(
      screen
        .getByRole("link", { name: "Open Telegram again" })
        .getAttribute("href"),
    ).toBe(LINK);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: "Connect Telegram" }),
    ).toBeTruthy();
  });

  it("refreshes the page once the member has tapped Start", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    actions.telegramConnectedAction.mockResolvedValue({
      ok: true,
      data: { connected: true },
    });
    render(<TelegramCard connected={false} handle={null} notices="mine" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
    await screen.findByRole("link", { name: "Open Telegram again" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("gives the link to tap when the browser blocked the new tab", async () => {
    vi.mocked(window.open).mockReturnValue(null);
    render(<TelegramCard connected={false} handle={null} notices="mine" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
    const link = await screen.findByRole("link", { name: "Open Telegram" });
    expect(link.getAttribute("href")).toBe(LINK);
    expect(screen.queryByText(/Telegram is open/)).toBeNull();
    expect(screen.getByText(/Tap Open Telegram, then tap/)).toBeTruthy();
  });

  it("closes the tab and says so when making the link fails outright", async () => {
    actions.createTelegramLinkAction.mockRejectedValue(new Error("offline"));
    render(<TelegramCard connected={false} handle={null} notices="mine" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Something went wrong. Please try again.",
    );
    expect(tab.close).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Connect Telegram" }),
    ).toBeTruthy();
  });

  it("says the camp is not set up when the link cannot be made", async () => {
    actions.createTelegramLinkAction.mockResolvedValue({
      ok: false,
      error: "Telegram isn't set up for the camp yet.",
    });
    render(<TelegramCard connected={false} handle={null} notices="mine" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Telegram isn't set up for the camp yet.",
    );
  });

  it("is On with the handle, the notices choice and Disconnect", async () => {
    render(<TelegramCard connected handle="cloud_404" notices="mine" />);
    expect(screen.getByText("On")).toBeTruthy();
    expect(screen.getByText("@cloud_404")).toBeTruthy();
    expect(
      (
        screen.getByRole("radio", {
          name: /Only notices about me/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    const all = screen.getByRole("radio", {
      name: /All my notices/,
    }) as HTMLInputElement;
    fireEvent.click(all);
    expect(all.checked).toBe(true);
    await waitFor(() =>
      expect(actions.setTelegramNoticesAction).toHaveBeenCalledWith("all"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() =>
      expect(actions.disconnectTelegramAction).toHaveBeenCalled(),
    );
  });

  it("puts the choice back when it cannot be saved", async () => {
    actions.setTelegramNoticesAction.mockResolvedValue({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    render(<TelegramCard connected handle={null} notices="mine" />);
    fireEvent.click(screen.getByRole("radio", { name: /All my notices/ }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("radio", {
            name: /Only notices about me/,
          }) as HTMLInputElement
        ).checked,
      ).toBe(true),
    );
  });
});
