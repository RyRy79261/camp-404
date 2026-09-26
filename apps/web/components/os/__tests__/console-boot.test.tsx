import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOT_COOKIE } from "@/lib/boot";
import { ConsoleBoot } from "../console-boot";

// The boot screen (decision 6 A): a line at a time, then the welcome; any key
// or tap skips it; under reduced motion it ends at once. When it ends it sets
// the session cookie the layout reads, so it plays once per browser session.

const LINES = [
  { text: "404 OS BIOS v4.04" },
  { text: "Counting cats", ok: "2 (Jinn awake, Prince asleep)" },
];

function motion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduced && query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

function clearCookie() {
  document.cookie = `${BOOT_COOKIE}=; path=/; max-age=0`;
}

beforeEach(() => {
  vi.useFakeTimers();
  clearCookie();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearCookie();
});

describe("ConsoleBoot", () => {
  it("plays its lines, welcomes the member, then goes and remembers it did", () => {
    motion(false);
    const { container } = render(
      <ConsoleBoot lines={LINES} welcome="Welcome back, Nova" />,
    );
    const screenEl = container.querySelector<HTMLElement>("[data-os-boot]")!;
    expect(screenEl.textContent).not.toContain("Counting cats");
    act(() => {
      vi.advanceTimersByTime(70 * 2);
    });
    expect(screenEl.textContent).toContain("Counting cats");
    expect(screenEl.textContent).toContain("2 (Jinn awake, Prince asleep)");
    act(() => {
      vi.advanceTimersByTime(70);
    });
    expect(screenEl.textContent).toContain("Welcome back, Nova");
    expect(document.cookie).not.toContain(BOOT_COOKIE);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(document.querySelector("[data-os-boot]")).toBeNull();
    expect(document.cookie).toContain(`${BOOT_COOKIE}=1`);
  });

  it("says only the welcome to a screen reader, and puts the desktop under it to sleep", () => {
    motion(false);
    const desk = document.createElement("div");
    desk.id = "os-desktop";
    document.body.append(desk);
    try {
      render(<ConsoleBoot lines={LINES} welcome="Welcome back, Nova" />);
      expect(desk.hasAttribute("inert")).toBe(true);
      // The log is a picture: not one line of it is in the accessibility
      // tree, and the one live region is empty until the welcome.
      const status = screen.getByRole("status");
      expect(status.textContent).toBe("");
      act(() => {
        vi.advanceTimersByTime(70 * 3);
      });
      expect(status.textContent).toBe("Welcome back, Nova");
      expect(screen.queryByText("Counting cats")).toBeTruthy();
      expect(
        screen.queryByText("Counting cats")!.closest("[aria-hidden=true]"),
      ).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(desk.hasAttribute("inert")).toBe(false);
    } finally {
      desk.remove();
    }
  });

  it("goes at the first key or tap", () => {
    motion(false);
    render(<ConsoleBoot lines={LINES} welcome="Welcome back, Nova" />);
    fireEvent.keyDown(window, { key: "a" });
    expect(document.querySelector("[data-os-boot]")).toBeNull();
    expect(document.cookie).toContain(`${BOOT_COOKIE}=1`);
  });

  it("never plays under reduced motion", () => {
    motion(true);
    render(<ConsoleBoot lines={LINES} welcome="Welcome back, Nova" />);
    expect(document.querySelector("[data-os-boot]")).toBeNull();
    expect(document.cookie).toContain(`${BOOT_COOKIE}=1`);
  });
});
