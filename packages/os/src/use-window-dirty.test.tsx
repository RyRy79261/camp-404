import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WindowDirtyProvider,
  WindowKeyProvider,
  useKeptDraft,
  useKeptDrafts,
  useLeaveGuard,
  useWindowDirty,
} from "./use-window-dirty";

// Back cannot be asked about (popstate is not cancellable), so a dirty page
// that goes without a "leave anyway" hands its draft to the provider, in
// memory, and takes it back when its window opens again. A yes to the guard,
// a save, or the desktop dropping it means nothing is kept.

afterEach(cleanup);

function Note({ start = "" }: { start?: string }) {
  const kept = useKeptDraft();
  const [text, setText] = useState(typeof kept === "string" ? kept : start);
  const settle = useWindowDirty(text !== start, "Leave your note?", text);
  return (
    <>
      <input
        aria-label="Note"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {typeof kept === "string" && <p>Unsaved changes restored</p>}
      <button
        type="button"
        onClick={() => {
          settle();
          setText(start);
        }}
      >
        Save
      </button>
    </>
  );
}

let guard: ReturnType<typeof useLeaveGuard>;
let keeper: ReturnType<typeof useKeptDrafts>;
function Probe() {
  guard = useLeaveGuard();
  keeper = useKeptDrafts();
  return null;
}

function Harness({
  open,
  windowKey = "note:1",
  confirm = () => true,
}: {
  open: boolean;
  windowKey?: string;
  confirm?: (m: string) => boolean;
}) {
  return (
    <WindowDirtyProvider confirm={confirm}>
      <Probe />
      {open && (
        <WindowKeyProvider windowKey={windowKey}>
          <Note />
        </WindowKeyProvider>
      )}
    </WindowDirtyProvider>
  );
}

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText("Note"), { target: { value } });
const note = () => (screen.getByLabelText("Note") as HTMLInputElement).value;

describe("a draft kept across a Back", () => {
  it("keeps a dirty page's draft when it goes unasked, and restores it once", () => {
    const { rerender } = render(<Harness open />);
    type("half a thought");
    // A Back: the page goes, nobody was asked.
    rerender(<Harness open={false} />);
    rerender(<Harness open />);
    expect(note()).toBe("half a thought");
    expect(screen.getByText("Unsaved changes restored")).toBeTruthy();

    // Taken back: the provider no longer holds it. Leave clean this time.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    rerender(<Harness open={false} />);
    rerender(<Harness open />);
    expect(note()).toBe("");
    expect(screen.queryByText("Unsaved changes restored")).toBeNull();
  });

  it("keeps nothing when the member said leave anyway", () => {
    const { rerender } = render(<Harness open />);
    type("throw this away");
    expect(guard("note:1")).toBe(true);
    rerender(<Harness open={false} />);
    rerender(<Harness open />);
    expect(note()).toBe("");
  });

  it("keeps it when the member said stay and then went by Back", () => {
    const { rerender } = render(<Harness open confirm={() => false} />);
    type("keep me");
    expect(guard("note:1")).toBe(false);
    rerender(<Harness open={false} confirm={() => false} />);
    rerender(<Harness open confirm={() => false} />);
    expect(note()).toBe("keep me");
  });

  it("keeps nothing once saved", () => {
    const { rerender } = render(<Harness open />);
    type("saved text");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    rerender(<Harness open={false} />);
    rerender(<Harness open />);
    expect(note()).toBe("");
  });

  it("is dropped by the desktop: one window on close, all on clear", () => {
    const { rerender } = render(<Harness open />);
    type("one");
    rerender(<Harness open={false} />);
    keeper.drop("note:1");
    rerender(<Harness open />);
    expect(note()).toBe("");

    type("two");
    rerender(<Harness open={false} />);
    keeper.clear();
    rerender(<Harness open />);
    expect(note()).toBe("");
  });

  it("belongs to its window: another window's page does not get it", () => {
    const { rerender } = render(<Harness open />);
    type("for window one");
    rerender(<Harness open={false} />);
    rerender(<Harness open windowKey="note:2" />);
    expect(note()).toBe("");
  });

  it("outside any provider the hooks do nothing", () => {
    const onBeforeUnload = vi.fn();
    render(<Note />);
    type("anything");
    window.addEventListener("beforeunload", onBeforeUnload);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    window.removeEventListener("beforeunload", onBeforeUnload);
    expect(event.defaultPrevented).toBe(false);
  });
});
