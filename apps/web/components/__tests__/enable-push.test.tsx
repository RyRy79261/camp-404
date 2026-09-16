import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

vi.mock("firebase/messaging", () => ({ onMessage: vi.fn(() => () => {}) }));
vi.mock("@/lib/firebase-client", () => ({
  getMessagingIfSupported: vi.fn(async () => ({})),
}));
vi.mock("@/components/push/device-token", () => ({
  registerDeviceToken: vi.fn(),
}));

import { registerDeviceToken } from "@/components/push/device-token";
import {
  EnablePush,
  PUSH_REGISTER_FAILED,
} from "@/components/push/enable-push";

function stubNotification(
  permission: NotificationPermission,
  next?: NotificationPermission,
) {
  vi.stubGlobal(
    "Notification",
    Object.assign(function Notification() {}, {
      permission,
      requestPermission: vi.fn(async () => next ?? permission),
    }),
  );
}

beforeEach(() => {
  Object.defineProperty(navigator, "serviceWorker", {
    value: {},
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(registerDeviceToken).mockReset();
});

describe("EnablePush", () => {
  it("turns on only when the server stored the token", async () => {
    stubNotification("default", "granted");
    vi.mocked(registerDeviceToken).mockResolvedValue(true);
    render(<EnablePush />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable notifications" }),
    );
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
    expect(registerDeviceToken).toHaveBeenCalledOnce();
  });

  it("says so and offers to try again when storing the token fails", async () => {
    stubNotification("default", "granted");
    vi.mocked(registerDeviceToken)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    render(<EnablePush />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable notifications" }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      PUSH_REGISTER_FAILED,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
  });

  it("brings the button back when an already-allowed device cannot register", async () => {
    stubNotification("granted");
    vi.mocked(registerDeviceToken).mockResolvedValue(false);
    render(<EnablePush />);
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeDefined();
    expect(screen.getByRole("alert").textContent).toBe(PUSH_REGISTER_FAILED);
  });

  it("renders nothing for an allowed device that registers, or a blocked one", async () => {
    stubNotification("granted");
    vi.mocked(registerDeviceToken).mockResolvedValue(true);
    const { container } = render(<EnablePush />);
    await waitFor(() => expect(registerDeviceToken).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
    cleanup();

    stubNotification("denied");
    const blocked = render(<EnablePush />);
    await waitFor(() => expect(blocked.container.innerHTML).toBe(""));
  });
});
