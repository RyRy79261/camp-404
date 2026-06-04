import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { AcknowledgementGate } from "./acknowledgement-gate";

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
    // Body scroll is locked while the takeover is up.
    expect(document.body.style.overflow).toBe("hidden");
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
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).toBeNull(),
    );
  });
});
