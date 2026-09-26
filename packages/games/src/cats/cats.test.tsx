// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClockCat } from "./clock-cat";
import { PawTrail } from "./paw-trail";
import { PeekingCat, PEEK_MAX_MS, PEEK_MIN_MS, PEEK_MS, usePeek } from "./peek";
import { PixelCat } from "./pixel-cat";
import { useDesktopSecrets } from "./secrets";
import { PRINCE_SLEEPING } from "./sprites";

function setReducedMotion(on: boolean) {
  (globalThis as { __reducedMotion?: boolean }).__reducedMotion = on;
}

function keys(target: EventTarget, ks: readonly string[]) {
  for (const key of ks) fireEvent.keyDown(target, { key });
}

beforeEach(() => setReducedMotion(false));
afterEach(() => {
  setReducedMotion(false);
  vi.useRealTimers();
});

describe("PixelCat", () => {
  it("is memoised, and draws runs of the desktop's colours", () => {
    expect((PixelCat as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for("react.memo"),
    );
    const { container } = render(<PixelCat sprite={["KKO"]} />);
    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(2);
    expect(rects[0]!.getAttribute("width")).toBe("2");
    expect(rects[1]!.getAttribute("fill")).toBe("var(--os-muted)");
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("turns inside the SVG, so its box never grows", () => {
    const { container } = render(
      <PixelCat sprite={["KK", "KK"]} rotate={30} />,
    );
    expect(container.querySelector("g")!.getAttribute("transform")).toBe(
      "rotate(30 1 1)",
    );
    expect(container.querySelector("svg")!.style.transform).toBe("");
  });
});

describe("ClockCat", () => {
  it("is Prince, and answers when petted", () => {
    const { container } = render(<ClockCat />);
    const prince = container.querySelector<HTMLElement>('[data-cat="prince"]')!;
    expect(prince.querySelectorAll("rect").length).toBeGreaterThan(20);
    expect(container.querySelector(".cat-bubble")).toBeNull();
    fireEvent.click(prince);
    expect(container.querySelector(".cat-bubble")!.textContent).toBe("prrr");
    fireEvent.click(prince);
    expect(container.querySelector(".cat-bubble")!.textContent).toBe("prrrrr");
  });

  it("is an easter egg: never labelled, never a Tab stop, hidden from assistive tech", () => {
    const { container } = render(<ClockCat />);
    const prince = container.querySelector<HTMLElement>('[data-cat="prince"]')!;
    expect(prince.getAttribute("aria-hidden")).toBe("true");
    expect(prince.tabIndex).toBe(-1);
    expect(prince.hasAttribute("aria-label")).toBe(false);
    expect(prince.hasAttribute("title")).toBe(false);
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.click(prince);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("takes its words and placement from the app", () => {
    const { container } = render(
      <ClockCat lines={["mew"]} className="right-2" />,
    );
    const cat = container.querySelector<HTMLElement>('[data-cat="prince"]')!;
    expect(cat.className).toContain("right-2");
    fireEvent.click(cat);
    expect(container.querySelector(".cat-bubble")!.textContent).toBe("mew");
  });
});

function Peeker() {
  const [peeking, show] = usePeek();
  return (
    <div>
      <button onClick={show}>feed</button>
      {peeking && <PeekingCat />}
    </div>
  );
}

describe("the peeking cat", () => {
  it("peeks now and then, and at once when fed", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { container } = render(<Peeker />);
    act(() => vi.advanceTimersByTime(PEEK_MIN_MS - 1));
    expect(container.querySelector(".cat-peek")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector(".cat-peek")).not.toBeNull();
    act(() => vi.advanceTimersByTime(PEEK_MS));
    expect(container.querySelector(".cat-peek")).toBeNull();
    fireEvent.click(screen.getByText("feed"));
    expect(container.querySelector(".cat-peek")).not.toBeNull();
    // Never in the way: it takes no clicks.
    expect(
      container.querySelector(".cat-peek")!.parentElement!.className,
    ).toContain("pointer-events-none");
    vi.restoreAllMocks();
  });

  it("never peeks under reduced motion", () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    const { container } = render(<Peeker />);
    act(() => vi.advanceTimersByTime(PEEK_MAX_MS * 3));
    fireEvent.click(screen.getByText("feed"));
    expect(container.querySelector(".cat-peek")).toBeNull();
  });
});

function Secrets(props: { onKonami: () => void; onMeow: () => void }) {
  useDesktopSecrets(props);
  return <input aria-label="field" />;
}

describe("useDesktopSecrets", () => {
  it("hears the Konami code and 'meow' on the desktop", () => {
    const onKonami = vi.fn();
    const onMeow = vi.fn();
    render(<Secrets onKonami={onKonami} onMeow={onMeow} />);
    keys(document.body, [
      "ArrowUp",
      "ArrowUp",
      "ArrowDown",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "b",
      "a",
    ]);
    expect(onKonami).toHaveBeenCalledTimes(1);
    keys(document.body, [..."meow"]);
    expect(onMeow).toHaveBeenCalledTimes(1);
  });

  it("ignores a field, and keys held with Ctrl", () => {
    const onMeow = vi.fn();
    render(<Secrets onKonami={() => {}} onMeow={onMeow} />);
    keys(screen.getByLabelText("field"), [..."meow"]);
    expect(onMeow).not.toHaveBeenCalled();
    for (const key of "meow")
      fireEvent.keyDown(document.body, { key, ctrlKey: true });
    expect(onMeow).not.toHaveBeenCalled();
  });
});

describe("PawTrail", () => {
  it("leaves prints behind the pointer that fade away", () => {
    vi.useFakeTimers();
    const { container } = render(<PawTrail on />);
    fireEvent.pointerMove(window, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 10, clientY: 0 });
    expect(container.querySelectorAll(".cat-paw")).toHaveLength(0);
    fireEvent.pointerMove(window, { clientX: 40, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 0 });
    expect(container.querySelectorAll(".cat-paw")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1300));
    expect(container.querySelectorAll(".cat-paw")).toHaveLength(0);
  });

  it("is nothing at all when off, or under reduced motion", () => {
    const off = render(<PawTrail on={false} />);
    expect(off.container.innerHTML).toBe("");
    off.unmount();
    setReducedMotion(true);
    const { container } = render(<PawTrail on />);
    fireEvent.pointerMove(window, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 0 });
    expect(container.innerHTML).toBe("");
  });
});

it("draws Prince's own sprite on the clock", () => {
  const { container } = render(<ClockCat />);
  const svg = container.querySelector("svg")!;
  expect(svg.getAttribute("viewBox")).toBe(`0 0 21 ${PRINCE_SLEEPING.length}`);
});
