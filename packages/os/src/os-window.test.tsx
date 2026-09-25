import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as Select from "@radix-ui/react-select";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OsWindowFrame } from "./os-window";
import { WindowDirtyProvider, useWindowDirty } from "./use-window-dirty";
import type { OsWindow } from "./window-manager";

const WIN: OsWindow<"notes"> = {
  id: "notes",
  x: 40,
  y: 40,
  w: 400,
  h: 300,
  z: 1,
};

function renderWindow(
  children: ReactNode,
  win: OsWindow<"notes"> = WIN,
  titleHeading = false,
) {
  const handlers = {
    onFocus: vi.fn(),
    onClose: vi.fn(),
    onMinimize: vi.fn(),
    onToggleMaximize: vi.fn(),
    onMove: vi.fn(),
    onResize: vi.fn(),
  };
  const view = render(
    <OsWindowFrame
      win={win}
      title="NOTES.TXT"
      titleHeading={titleHeading}
      isTop
      hidden={false}
      phone={false}
      {...handlers}
    >
      {children}
    </OsWindowFrame>,
  );
  return { ...view, ...handlers };
}

function Colours() {
  return (
    <Select.Root>
      <Select.Trigger aria-label="Colour">
        <Select.Value placeholder="Pick a colour" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content>
          <Select.Viewport>
            <Select.Item value="pink">
              <Select.ItemText>Pink</Select.ItemText>
            </Select.Item>
            <Select.Item value="blue">
              <Select.ItemText>Blue</Select.ItemText>
            </Select.Item>
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

describe("OsWindowFrame", () => {
  it("is a labelled window region, not a dialog", () => {
    renderWindow(<p>Hello</p>);
    const win = screen.getByRole("region", { name: "NOTES.TXT" });
    expect(win.getAttribute("aria-roledescription")).toBe("window");
    expect(screen.queryByRole("dialog")).toBeNull();
    // The title names the window; the page inside owns the headings.
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("draws the title as an h2 when asked (Join)", () => {
    renderWindow(<p>Hello</p>, WIN, true);
    const heading = screen.getByRole("heading", {
      level: 2,
      name: "NOTES.TXT",
    });
    expect(screen.getByRole("region", { name: "NOTES.TXT" })).toBe(
      heading.closest("section"),
    );
  });

  it("Esc inside the window closes it", () => {
    const { onClose } = renderWindow(<button type="button">Inside</button>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Inside" }), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Radix both prevents the Escape and fires it from a portal outside the
  // window, so this goes red only when BOTH checks of the guard are gone.
  // The two tests after it pin each check alone; they are not duplicates.
  it("Esc inside an open Radix Select closes the Select, not the window", () => {
    const { onClose } = renderWindow(<Colours />);
    const win = screen.getByRole("region", { name: "NOTES.TXT" });
    const trigger = screen.getByRole("combobox", { name: "Colour" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    // The menu is portalled out of the window's own DOM.
    expect(win.contains(screen.getByRole("listbox"))).toBe(false);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    // With the menu shut, the next Esc is the window's.
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores an Esc from a portal that did not handle it", () => {
    function Portalled() {
      return createPortal(
        <button type="button">Outside</button>,
        document.body,
      );
    }
    const { onClose } = renderWindow(<Portalled />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Outside" }), {
      key: "Escape",
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores an Esc that something inside already used", () => {
    const { onClose } = renderWindow(
      <input
        aria-label="Search"
        onKeyDown={(e) => {
          if (e.key === "Escape") e.preventDefault();
        }}
      />,
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search" }), {
      key: "Escape",
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("focuses the element that asks for it when it opens", () => {
    renderWindow(<input aria-label="Prompt" data-autofocus />);
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBe(
      document.activeElement,
    );
  });
});

describe("dragging", () => {
  let frames: FrameRequestCallback[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    frames = [];
  });

  function stubFrames() {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames[id - 1] = () => {};
    });
  }

  const pointer = (type: string, x: number, y: number) =>
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });

  it("moves from the title bar at most once a frame, left and top only", () => {
    stubFrames();
    const { container, onMove } = renderWindow(<p>Body</p>);
    const bar = container.querySelector<HTMLElement>("[data-titlebar]")!;

    fireEvent(bar, pointer("pointerdown", 100, 100));
    for (const x of [110, 120, 130])
      fireEvent(bar, pointer("pointermove", x, 105));
    expect(onMove).not.toHaveBeenCalled();
    act(() => frames.shift()!(0));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenLastCalledWith(WIN.x + 30, WIN.y + 5);

    // Letting go reports where the pointer ended, without waiting a frame.
    fireEvent(bar, pointer("pointermove", 150, 90));
    fireEvent(bar, pointer("pointerup", 150, 90));
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onMove).toHaveBeenLastCalledWith(WIN.x + 50, WIN.y - 10);

    const style = screen.getByRole("region", { name: "NOTES.TXT" }).style;
    expect(style.left).toBe(`${WIN.x}px`);
    expect(style.transform).toBe("");
  });

  it("does not drag from the body", () => {
    stubFrames();
    const { onMove } = renderWindow(<p>Body</p>);
    const body = screen.getByText("Body");
    fireEvent(body, pointer("pointerdown", 100, 100));
    fireEvent(body, pointer("pointermove", 200, 200));
    fireEvent(body, pointer("pointerup", 200, 200));
    expect(frames).toHaveLength(0);
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("unsaved input", () => {
  function Editor() {
    const [dirty, setDirty] = useState(true);
    useWindowDirty(dirty, "Your note is not saved. Close it anyway?");
    return (
      <button type="button" onClick={() => setDirty(false)}>
        Save
      </button>
    );
  }

  function renderDirty(answer: boolean) {
    const confirm = vi.fn(() => answer);
    const handlers = { onClose: vi.fn(), onMinimize: vi.fn() };
    render(
      <WindowDirtyProvider confirm={confirm}>
        <OsWindowFrame
          win={WIN}
          title="NOTES.TXT"
          isTop
          hidden={false}
          phone={false}
          onFocus={() => {}}
          onToggleMaximize={() => {}}
          onMove={() => {}}
          onResize={() => {}}
          {...handlers}
        >
          <Editor />
        </OsWindowFrame>
      </WindowDirtyProvider>,
    );
    return { confirm, ...handlers };
  }

  it("asks before closing or minimising, and stays if the answer is no", () => {
    const { confirm, onClose, onMinimize } = renderDirty(false);
    fireEvent.click(screen.getByRole("button", { name: "Close NOTES.TXT" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimise NOTES.TXT" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Save" }), {
      key: "Escape",
    });
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(confirm).toHaveBeenCalledWith(
      "Your note is not saved. Close it anyway?",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onMinimize).not.toHaveBeenCalled();
  });

  it("goes when the answer is yes, and asks nothing once saved", () => {
    const { confirm, onClose } = renderDirty(true);
    fireEvent.click(screen.getByRole("button", { name: "Close NOTES.TXT" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    confirm.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Close NOTES.TXT" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("holds a page unload while anything is unsaved", () => {
    renderDirty(false);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const again = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false);
  });
});
