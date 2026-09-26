import * as Select from "@radix-ui/react-select";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BlockingLayer, useInBlockingLayer } from "./blocking-layer";

function Form() {
  return (
    <form>
      <h2 id="form-title">Coming this year?</h2>
      <label>
        Your answer
        <input name="answer" />
      </label>
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
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <button type="submit">Send</button>
    </form>
  );
}

function renderHeld(onEsc = vi.fn()) {
  const desktop = document.createElement("div");
  desktop.id = "os-desktop";
  document.body.appendChild(desktop);
  // The desktop's own Esc (it would close a window).
  document.addEventListener("keydown", onEsc);
  const view = render(
    <BlockingLayer
      title="Required form"
      position="1 of 2"
      labelledBy="form-title"
      inertTarget="os-desktop"
      signOut={<a href="/auth/sign-out">Sign out</a>}
    >
      <Form />
    </BlockingLayer>,
  );
  return {
    ...view,
    desktop,
    cleanupDesktop: () => {
      document.removeEventListener("keydown", onEsc);
      desktop.remove();
    },
  };
}

describe("BlockingLayer", () => {
  it("is a modal dialog named by the form, with no close, minimise or maximise", () => {
    const { cleanupDesktop } = renderHeld();
    const dialog = screen.getByRole("dialog", { name: "Coming this year?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Required form")).toBeTruthy();
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /close|minimise|full screen/i }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Sign out" })).toBeTruthy();
    cleanupDesktop();
  });

  it("starts focus in the form and keeps Tab inside", () => {
    const { cleanupDesktop } = renderHeld();
    const field = screen.getByLabelText("Your answer");
    expect(document.activeElement).toBe(field);
    const signOut = screen.getByRole("link", { name: "Sign out" });
    act(() => signOut.focus());
    fireEvent.keyDown(signOut, { key: "Tab" });
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(signOut);
    cleanupDesktop();
  });

  it("swallows Esc, so it never reaches the desktop", () => {
    const onEsc = vi.fn();
    const { cleanupDesktop } = renderHeld(onEsc);
    fireEvent.keyDown(screen.getByLabelText("Your answer"), { key: "Escape" });
    expect(onEsc).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Any other key still reaches it.
    fireEvent.keyDown(screen.getByLabelText("Your answer"), { key: "a" });
    expect(onEsc).toHaveBeenCalledOnce();
    cleanupDesktop();
  });

  it("lets the form's own Select open and close above it", () => {
    const { cleanupDesktop } = renderHeld();
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Colour" }), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanupDesktop();
  });

  it("puts the desktop to sleep, and wakes only what it put to sleep", () => {
    const { desktop, unmount, cleanupDesktop } = renderHeld();
    expect(desktop.hasAttribute("inert")).toBe(true);
    unmount();
    expect(desktop.hasAttribute("inert")).toBe(false);
    cleanupDesktop();

    const asleep = document.createElement("div");
    asleep.id = "os-desktop";
    asleep.setAttribute("inert", "");
    document.body.appendChild(asleep);
    const view = render(
      <BlockingLayer title="Required form" inertTarget="os-desktop">
        <input aria-label="x" />
      </BlockingLayer>,
    );
    view.unmount();
    expect(asleep.hasAttribute("inert")).toBe(true);
    asleep.remove();
  });

  it("is named by its title bar when no heading is given", () => {
    render(
      <BlockingLayer title="Required form">
        <input aria-label="x" />
      </BlockingLayer>,
    );
    expect(screen.getByRole("dialog", { name: "Required form" })).toBeTruthy();
  });

  it("can take its name from the page's h1, and follows the page", () => {
    const view = render(
      <BlockingLayer title="Required form" nameFromHeading>
        <h1>Tent check</h1>
      </BlockingLayer>,
    );
    expect(screen.getByRole("dialog", { name: "Tent check" })).toBeTruthy();
    // The form's completion page, in the same layer.
    view.rerender(
      <BlockingLayer title="Required form" nameFromHeading>
        <h1 id="done">All done</h1>
      </BlockingLayer>,
    );
    expect(screen.getByRole("dialog", { name: "All done" })).toBeTruthy();
    // No heading: the title bar.
    view.rerender(
      <BlockingLayer title="Required form" nameFromHeading>
        <p>Loading</p>
      </BlockingLayer>,
    );
    expect(screen.getByRole("dialog", { name: "Required form" })).toBeTruthy();
  });

  it("tells a page inside it that the layer has its own Sign out", () => {
    function PageSignOut() {
      return useInBlockingLayer() ? null : (
        <a href="/auth/sign-out">Sign out</a>
      );
    }
    // Outside any layer (a bare page) the page keeps its own.
    const bare = render(<PageSignOut />);
    expect(screen.getAllByRole("link", { name: "Sign out" })).toHaveLength(1);
    bare.unmount();

    // Inside a layer with its own Sign out: one, the layer's.
    const held = render(
      <BlockingLayer title="Required form" signOut={<a href="/x">Sign out</a>}>
        <PageSignOut />
      </BlockingLayer>,
    );
    const links = screen.getAllByRole("link", { name: "Sign out" });
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("/x");
    held.unmount();

    // A layer drawn without one leaves the page's.
    render(
      <BlockingLayer title="Required form">
        <PageSignOut />
      </BlockingLayer>,
    );
    expect(
      screen.getByRole("link", { name: "Sign out" }).getAttribute("href"),
    ).toBe("/auth/sign-out");
  });
});
