import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const refresh = vi.fn();
const push = vi.fn();
// One router object for every render, as Next's useRouter gives.
const router = { refresh, push };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { getToasts, toast } from "@camp404/ui/components/toast";
import { ACK_FAILED, AcknowledgementGate } from "./acknowledgement-gate";

const fetchMock = vi.fn();
const ok = (body: unknown) => ({ ok: true, json: async () => body });
const ITEM = {
  // A real UUID — the acknowledge route validates deliveryId as z.string().uuid().
  deliveryId: "7f5e2f7a-6f50-4c89-8df9-2f7b8f3dc31e",
  title: "Burn-night briefing",
  body: "Gates open at sundown.",
  senderName: "Ada",
  createdAt: "2026-05-28T14:02:00.000Z",
};

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("AcknowledgementGate — board S22", () => {
  it("renders nothing while the pending queue is empty", async () => {
    fetchMock.mockResolvedValue(ok({ pending: [] }));
    const { container } = render(<AcknowledgementGate />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("takes over with the recomposed chrome for a pending announcement", async () => {
    fetchMock.mockResolvedValue(ok({ pending: [ITEM] }));
    render(<AcknowledgementGate />);
    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByText("Burn-night briefing")).toBeDefined();
    expect(screen.getByText("Camp announcement")).toBeDefined(); // mono eyebrow
    expect(screen.getByText(/From Ada/)).toBeDefined();
    expect(
      screen.getByText(/can.t dismiss this until you acknowledge/i),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeDefined();
    // Body scroll is locked while the takeover is up. The lock lands in a
    // passive effect, which React commits after the DOM node `findByRole`
    // resolved on — so await it rather than reading it synchronously.
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));
  });

  it("POSTs the acknowledgement and refreshes server components", async () => {
    fetchMock.mockResolvedValue(ok({ pending: [ITEM] }));
    render(<AcknowledgementGate />);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => {
      const ackCall = fetchMock.mock.calls.find(
        (c) => c[0] === "/api/notifications/acknowledge",
      );
      expect(ackCall?.[1]?.method).toBe("POST");
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // Acknowledged item leaves the queue → the takeover dismisses.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the message up and says so when the acknowledgement fails, then retries", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/notifications/acknowledge"
        ? { ok: false, json: async () => ({}) }
        : ok({ pending: [ITEM] }),
    );
    render(<AcknowledgementGate />);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      ACK_FAILED,
    );
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();

    // A thrown fetch (offline) reads the same, instead of an unhandled rejection.
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/notifications/acknowledge")
        throw new TypeError("offline");
      return ok({ pending: [ITEM] });
    });
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Acknowledge" }),
      ).toHaveProperty("disabled", false),
    );
    expect(screen.getByRole("alert").textContent).toContain(ACK_FAILED);

    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/notifications/acknowledge"
        ? ok({ ok: true })
        : ok({ pending: [ITEM] }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("moves focus to the message and makes the page behind it inert", async () => {
    fetchMock.mockResolvedValue(ok({ pending: [ITEM] }));
    const page = document.createElement("main");
    page.innerHTML = '<a href="/somewhere">Behind</a>';
    document.body.prepend(page);
    try {
      render(<AcknowledgementGate />);
      await screen.findByRole("dialog");
      const title = screen.getByRole("heading", {
        name: "Burn-night briefing",
      });
      await waitFor(() => expect(document.activeElement).toBe(title));
      expect(page.hasAttribute("inert")).toBe(true);

      // Tab from the last stop wraps to the title, not out of the takeover.
      const button = screen.getByRole("button", { name: "Acknowledge" });
      button.focus();
      fireEvent.keyDown(button, { key: "Tab" });
      expect(document.activeElement).toBe(title);
      fireEvent.keyDown(title, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(button);

      fetchMock.mockResolvedValue(ok({ ok: true }));
      fireEvent.click(button);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(page.hasAttribute("inert")).toBe(false);
    } finally {
      page.remove();
    }
  });

  it("shows waiting pop-ups once as toasts that open what they are about", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/notifications/popups"
        ? ok({
            popups: [
              {
                deliveryId: "p1",
                title: "Water run",
                body: "Truck leaves at 9.",
                link: "/announcements/3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44",
              },
            ],
          })
        : ok({ pending: [], popups: 1 }),
    );
    render(<AcknowledgementGate />);
    await waitFor(() => expect(getToasts()).toHaveLength(1));
    const [shown] = getToasts();
    expect(shown).toMatchObject({
      title: "Water run",
      description: "Truck leaves at 9.",
    });
    shown!.action!.onClick();
    expect(push).toHaveBeenCalledWith(
      "/announcements/3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44",
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("claims no pop-up while a takeover is on screen, or when there is none", async () => {
    const claims = () =>
      fetchMock.mock.calls.filter((c) => c[0] === "/api/notifications/popups");

    fetchMock.mockResolvedValue(ok({ pending: [ITEM], popups: 2 }));
    render(<AcknowledgementGate />);
    await screen.findByRole("dialog");
    expect(claims()).toHaveLength(0);
    cleanup();

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(ok({ pending: [], popups: 0 }));
    render(<AcknowledgementGate />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(claims()).toHaveLength(0);
  });
});
