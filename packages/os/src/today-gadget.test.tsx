import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  TODAY_OPEN_KEY,
  TodayGadget,
  localStorageBoolean,
  useStoredBoolean,
  type BooleanStore,
} from "./today-gadget";

function Gadget({ store, count }: { store: BooleanStore; count?: number }) {
  const [open, setOpen] = useStoredBoolean(store);
  return (
    <TodayGadget open={open} onOpenChange={setOpen} count={count}>
      <p>Your to-dos</p>
      <button type="button">A to-do</button>
    </TodayGadget>
  );
}

/** A store in memory, standing in for the browser's. */
function memoryStore(initial: boolean | null = null): BooleanStore & {
  value: boolean | null;
} {
  const listeners = new Set<() => void>();
  const store = {
    value: initial,
    read: () => store.value,
    write: (v: boolean) => {
      store.value = v;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return store;
}

afterEach(() => window.localStorage.clear());

describe("TodayGadget", () => {
  it("puts the handle at the panel's top, and below a full-screen title bar", () => {
    const { rerender } = render(
      <TodayGadget open={false} onOpenChange={() => {}}>
        <p>Body</p>
      </TodayGadget>,
    );
    const handle = () => screen.getByRole("button", { name: "Show Today" });
    // The prototype's spot: level with the top of the panel.
    expect(handle().className).toMatch(/\bmt-2\b/);
    rerender(
      <TodayGadget open={false} onOpenChange={() => {}} clearTitleBar>
        <p>Body</p>
      </TodayGadget>,
    );
    // Clear of a full-screen window's minimise, restore and close.
    expect(handle().className).toMatch(/\bmt-12\b/);
    expect(handle().className).not.toMatch(/\bmt-2\b/);
  });

  it("is closed by default: a handle, and no body in the DOM", () => {
    render(<Gadget store={memoryStore()} count={3} />);
    const handle = screen.getByRole("button", { name: "Show Today, 3 due" });
    expect(handle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Your to-dos")).toBeNull();
  });

  it("opens from the handle, and the handle names the body it controls", () => {
    const store = memoryStore();
    render(<Gadget store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "Show Today" }));
    const handle = screen.getByRole("button", { name: "Hide Today" });
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("complementary", { name: "Today" });
    expect(panel.id).toBe(handle.getAttribute("aria-controls"));
    expect(screen.getByText("Your to-dos")).toBeTruthy();
    expect(store.value).toBe(true);
  });

  it("closes on Esc inside it, handing focus to the handle", () => {
    render(<Gadget store={memoryStore(true)} />);
    const todo = screen.getByRole("button", { name: "A to-do" });
    act(() => todo.focus());
    fireEvent.keyDown(todo, { key: "Escape" });
    expect(screen.queryByText("Your to-dos")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Show Today" }),
    );
  });

  it("renders closed on the server even when the browser remembers it open", () => {
    window.localStorage.setItem(TODAY_OPEN_KEY, "true");
    const html = renderToString(
      <Gadget store={localStorageBoolean(TODAY_OPEN_KEY)} />,
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Your to-dos");
  });
});

describe("localStorageBoolean", () => {
  it("remembers the choice as a boolean and nothing else", () => {
    const store = localStorageBoolean(TODAY_OPEN_KEY);
    expect(localStorageBoolean(TODAY_OPEN_KEY)).toBe(store);
    render(<Gadget store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "Show Today" }));
    expect(window.localStorage.getItem(TODAY_OPEN_KEY)).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hide Today" }));
    expect(window.localStorage.getItem(TODAY_OPEN_KEY)).toBe("false");
  });

  it("reads anything else as nothing stored", () => {
    const store = localStorageBoolean("camp404.test.flag");
    window.localStorage.setItem("camp404.test.flag", "yes");
    expect(store.read()).toBeNull();
    window.localStorage.setItem("camp404.test.flag", "false");
    expect(store.read()).toBe(false);
  });

  it("follows a change made in another tab", () => {
    const store = localStorageBoolean(TODAY_OPEN_KEY);
    render(<Gadget store={store} />);
    act(() => {
      window.localStorage.setItem(TODAY_OPEN_KEY, "true");
      window.dispatchEvent(
        new StorageEvent("storage", { key: TODAY_OPEN_KEY }),
      );
    });
    expect(screen.getByText("Your to-dos")).toBeTruthy();
  });
});

describe("TodayGadget over the windows", () => {
  it("lets a press through its frame to a window beneath, but not through its handle or panel", () => {
    const store = memoryStore(true);
    const { container } = render(<Gadget store={store} count={2} />);
    const frame = container.querySelector<HTMLElement>("[data-os-today]")!;
    expect(frame.className).toContain("pointer-events-none");
    const handle = screen.getByRole("button", { name: /^Hide Today/ });
    expect(handle.className).toContain("pointer-events-auto");
    expect(
      screen.getByRole("complementary", { name: "Today" }).className,
    ).toContain("pointer-events-auto");
    // It slides in when it opens; the handle rides on the panel's edge.
    expect(frame.className).toContain("os-slide-in");
    expect(frame.firstElementChild).toBe(handle);
  });
});
