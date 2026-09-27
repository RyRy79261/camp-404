// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampCats } from "./camp-cats";
import {
  FEED_STORAGE_KEY,
  memoryStorage,
  type FeedStorage,
} from "./feed-limit";
import { EAT_MS, type Rect, type WindowBox } from "./scene";

const WIN: WindowBox = { id: "roster", x: 300, y: 60, w: 720, h: 520 };
const ICONS: Rect[] = [
  { x: 40, y: 40, w: 56, h: 56 },
  { x: 40, y: 140, w: 56, h: 56 },
];
const perches = () => ICONS;

function setReducedMotion(on: boolean) {
  (globalThis as { __reducedMotion?: boolean }).__reducedMotion = on;
}

let clock = 0;
const now = () => clock;

beforeEach(() => {
  vi.useFakeTimers();
  clock = 1_000_000;
  setReducedMotion(false);
  // jsdom lays nothing out: give the layer a desktop's size.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 1200,
    height: 700,
    right: 1200,
    bottom: 700,
    toJSON: () => ({}),
  } as DOMRect);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function advance(ms: number) {
  clock += ms;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function layer(c: HTMLElement) {
  return c.querySelector<HTMLElement>("[data-camp-cats]")!;
}

function renderCats(windows: WindowBox[], storage: FeedStorage) {
  const r = render(
    <CampCats
      windows={windows}
      perches={perches}
      delayMs={90_000}
      storage={storage}
      now={now}
    />,
  );
  const rerender = (w: WindowBox[]) =>
    r.rerender(
      <CampCats
        windows={w}
        perches={perches}
        delayMs={90_000}
        storage={storage}
        now={now}
      />,
    );
  return { ...r, rerender };
}

describe("the two visiting cats, rendered", () => {
  it("come after 1.5 minutes under the window, go out when it moves, eat once", async () => {
    const storage = memoryStorage();
    const { container, rerender } = renderCats([WIN], storage);
    expect(layer(container).dataset.campCats).toBe("none");
    expect(layer(container).getAttribute("aria-hidden")).toBe("true");
    await advance(89_000);
    expect(layer(container).dataset.campCats).toBe("none");
    expect(container.querySelector("[data-camp-cat]")).toBeNull();
    await advance(1_000);
    expect(layer(container).dataset.campCats).toBe("waiting");
    expect(container.querySelectorAll("[data-camp-cat]")).toHaveLength(2);
    expect(container.querySelector("[data-camp-bowl]")).toBeNull();

    // The window moves off them: out they go (no Web Animations in jsdom,
    // so every walk ends at once) and settle, with the bowls out.
    rerender([{ ...WIN, y: 0, h: 150 }]);
    await advance(10);
    expect(layer(container).dataset.campCats).toBe("settled");
    const orange = container.querySelector<HTMLElement>(
      '[data-camp-cat="orange"]',
    )!;
    expect(orange.dataset.pose).toBe("scratch");
    expect(
      container.querySelector<HTMLElement>('[data-camp-cat="tortie"]')!.dataset
        .pose,
    ).toBe("sassy");
    const bowls =
      container.querySelectorAll<HTMLButtonElement>("[data-camp-bowl]");
    expect(bowls).toHaveLength(2);
    // Hidden from assistive tech and the Tab order; no name anywhere.
    expect(bowls[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(bowls[0]!.tabIndex).toBe(-1);
    expect(container.textContent).toBe("");

    fireEvent.click(bowls[0]!);
    expect(storage.getItem(FEED_STORAGE_KEY)).toBe(String(clock));
    await advance(10);
    expect(layer(container).dataset.campCats).toBe("eating");
    expect(
      container
        .querySelector("[data-camp-bowl]")!
        .getAttribute("data-camp-bowl"),
    ).toBe("full");
    await advance(EAT_MS);
    expect(layer(container).dataset.campCats).toBe("toPerches");
    await advance(10);
    expect(layer(container).dataset.campCats).toBe("done");
    expect(container.querySelector("[data-camp-bowl]")).toBeNull();
    expect(orange.dataset.pose).toBe("perch");
  });

  it("puts out no bowls within six hours of the last feed", async () => {
    const storage = memoryStorage();
    storage.setItem(FEED_STORAGE_KEY, String(clock - 60_000));
    const { container, rerender } = renderCats([WIN], storage);
    await advance(90_000);
    rerender([{ ...WIN, minimized: true }]);
    await advance(10);
    expect(layer(container).dataset.campCats).toBe("settled");
    expect(container.querySelector("[data-camp-bowl]")).toBeNull();
  });

  it("refuses a feed made meanwhile in another tab", async () => {
    const storage = memoryStorage();
    const { container, rerender } = renderCats([WIN], storage);
    await advance(90_000);
    rerender([]);
    await advance(10);
    const bowl =
      container.querySelector<HTMLButtonElement>("[data-camp-bowl]")!;
    storage.setItem(FEED_STORAGE_KEY, String(clock));
    fireEvent.click(bowl);
    await advance(10);
    expect(layer(container).dataset.campCats).toBe("settled");
    expect(container.querySelector("[data-camp-bowl]")).toBeNull();
  });

  it("never comes while no window is open, nor to a closed one", async () => {
    const storage = memoryStorage();
    const { container, rerender } = renderCats([], storage);
    await advance(200_000);
    expect(layer(container).dataset.campCats).toBe("none");
    rerender([WIN]);
    await advance(60_000);
    rerender([]);
    await advance(60_000);
    expect(layer(container).dataset.campCats).toBe("none");
  });

  it("waits for a hidden tab to come back", async () => {
    const storage = memoryStorage();
    const hidden = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    const { container } = renderCats([WIN], storage);
    await advance(120_000);
    expect(layer(container).dataset.campCats).toBe("none");
    hidden.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(layer(container).dataset.campCats).toBe("waiting");
  });

  it("under reduced motion: already in place, and a feed shows the end", async () => {
    setReducedMotion(true);
    const storage = memoryStorage();
    const { container } = renderCats([WIN], storage);
    await advance(90_000);
    expect(layer(container).dataset.campCats).toBe("settled");
    fireEvent.click(container.querySelector("[data-camp-bowl]")!);
    await advance(0);
    expect(layer(container).dataset.campCats).toBe("done");
    expect(container.querySelector("[data-camp-bowl]")).toBeNull();
  });

  it("held still by the app (Effects off) as under reduced motion, whatever the device says", async () => {
    const storage = memoryStorage();
    const { container } = render(
      <CampCats
        windows={[WIN]}
        perches={perches}
        storage={storage}
        now={now}
        still
      />,
    );
    await advance(90_000);
    expect(layer(container).dataset.campCats).toBe("settled");
  });

  it("takes Effects off turned on while they wait (the prop reaches them)", async () => {
    const storage = memoryStorage();
    const props = { windows: [WIN], perches, storage, now };
    const r = render(<CampCats {...props} />);
    r.rerender(<CampCats {...props} still />);
    await advance(90_000);
    expect(layer(r.container).dataset.campCats).toBe("settled");
  });
});
