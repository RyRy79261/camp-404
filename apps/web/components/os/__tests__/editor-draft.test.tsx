import { useState, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WindowDirtyProvider,
  WindowKeyProvider,
  useLeaveGuard,
} from "@camp404/os";
import {
  AUTOSAVE_AFTER_MS,
  DraftOwnerContext,
  DraftRestoredNote,
  stableJson,
  useDraftAutosave,
  useEditorDraft,
  type EditorDraft,
} from "../editor-draft";
import { draftStorageKey, forgetAllWindows } from "../window-storage";

// The four editors' drafts: the guard, the in-memory draft across a Back,
// and this tab's autosave, with "Unsaved changes restored" and Discard.

type Note = { text: string };
const SAVED: Note = { text: "saved words" };
const KEY = draftStorageKey("u-1", "note:1", "note");

const parse = (raw: unknown): Note | null =>
  typeof raw === "object" &&
  raw !== null &&
  typeof (raw as Note).text === "string"
    ? { text: (raw as Note).text }
    : null;

function Editor({
  saved = SAVED,
  onSaved,
}: {
  saved?: Note;
  onSaved?: () => void;
}) {
  const draft = useEditorDraft({ editor: "note", baseline: saved, parse });
  return <Form key={draft.generation} draft={draft} onSaved={onSaved} />;
}

function Form({
  draft,
  onSaved,
}: {
  draft: EditorDraft<Note>;
  onSaved?: () => void;
}) {
  const [text, setText] = useState(draft.start.text);
  const { dirty, saved } = useDraftAutosave(draft, { text });
  return (
    <>
      <DraftRestoredNote draft={draft} />
      <input
        aria-label="Text"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p>{dirty ? "dirty" : "clean"}</p>
      <button
        type="button"
        onClick={() => {
          saved();
          onSaved?.();
        }}
      >
        Save
      </button>
    </>
  );
}

let leave: (key?: string) => boolean;
function Guard() {
  leave = useLeaveGuard();
  return null;
}

function Desk({
  open = true,
  owner = "u-1",
  confirm = () => true,
  children = <Editor />,
}: {
  open?: boolean;
  owner?: string | null;
  confirm?: (m: string) => boolean;
  children?: ReactNode;
}) {
  return (
    <WindowDirtyProvider confirm={confirm}>
      <DraftOwnerContext.Provider value={owner}>
        <Guard />
        {open && (
          <WindowKeyProvider windowKey="note:1">{children}</WindowKeyProvider>
        )}
      </DraftOwnerContext.Provider>
    </WindowDirtyProvider>
  );
}

const input = () => screen.getByLabelText("Text") as HTMLInputElement;
const type = (value: string) =>
  fireEvent.change(input(), { target: { value } });
const stored = () => window.sessionStorage.getItem(KEY);

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("stableJson", () => {
  it("is the same whatever order the keys were written in", () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      stableJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
    expect(stableJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });
});

describe("autosave", () => {
  it("writes a moment after typing stops, and forgets once nothing is unsaved", () => {
    render(<Desk />);
    type("new words");
    expect(screen.getByText("dirty")).toBeTruthy();
    expect(stored()).toBeNull();
    act(() => vi.advanceTimersByTime(AUTOSAVE_AFTER_MS));
    expect(JSON.parse(stored()!)).toEqual({ text: "new words" });

    type("saved words");
    expect(screen.getByText("clean")).toBeTruthy();
    expect(stored()).toBeNull();
  });

  it("forgets the draft when it is saved, and asks nothing after", () => {
    const confirm = vi.fn(() => false);
    render(<Desk confirm={confirm} />);
    type("new words");
    act(() => vi.advanceTimersByTime(AUTOSAVE_AFTER_MS));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(stored()).toBeNull();
    expect(screen.getByText("clean")).toBeTruthy();
    expect(leave("note:1")).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("forgets it when the page moves on in the same moment as the save", () => {
    // A save that navigates away (the meeting editor): the form never
    // draws itself clean before it goes.
    function SaveAndGo() {
      const [open, setOpen] = useState(true);
      return open ? <Editor onSaved={() => setOpen(false)} /> : <p>Gone</p>;
    }
    render(
      <Desk>
        <SaveAndGo />
      </Desk>,
    );
    type("new words");
    act(() => vi.advanceTimersByTime(AUTOSAVE_AFTER_MS));
    expect(stored()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Gone")).toBeTruthy();
    expect(stored()).toBeNull();
  });

  it("stores nothing outside the desktop (no member, no window)", () => {
    render(<Editor />);
    type("new words");
    act(() => vi.advanceTimersByTime(AUTOSAVE_AFTER_MS * 2));
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("coming back to it", () => {
  it("restores a stored draft after the first paint, with Discard", () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ text: "from before" }));
    render(<Desk />);
    expect(input().value).toBe("from before");
    expect(screen.getByRole("status").textContent).toContain(
      "Unsaved changes restored.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(input().value).toBe("saved words");
    expect(screen.queryByRole("status")).toBeNull();
    expect(stored()).toBeNull();
  });

  it("throws away a stored draft that fails its check, or equals what is saved", () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ text: 42 }));
    render(<Desk />);
    expect(input().value).toBe("saved words");
    expect(screen.queryByRole("status")).toBeNull();
    expect(stored()).toBeNull();
    cleanup();

    window.sessionStorage.setItem(KEY, JSON.stringify(SAVED));
    render(<Desk />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(stored()).toBeNull();
  });

  it("keeps the last keystrokes when the page goes by Back, unasked", () => {
    const view = render(<Desk confirm={() => false} />);
    type("typed just now");
    // Gone before the pause: still written.
    view.rerender(<Desk confirm={() => false} open={false} />);
    expect(JSON.parse(stored()!)).toEqual({ text: "typed just now" });
    view.rerender(<Desk confirm={() => false} />);
    expect(input().value).toBe("typed just now");
    expect(screen.getByText("Unsaved changes restored.")).toBeTruthy();
  });

  it("throws it away when the member said leave anyway", () => {
    const view = render(<Desk confirm={() => true} />);
    type("not wanted");
    act(() => vi.advanceTimersByTime(AUTOSAVE_AFTER_MS));
    expect(stored()).not.toBeNull();
    expect(leave("note:1")).toBe(true);
    view.rerender(<Desk open={false} />);
    expect(stored()).toBeNull();
    view.rerender(<Desk />);
    expect(input().value).toBe("saved words");
  });

  it("is forgotten on sign-out", () => {
    window.sessionStorage.setItem(KEY, "{}");
    window.sessionStorage.setItem("unrelated", "1");
    forgetAllWindows(window.sessionStorage);
    expect(stored()).toBeNull();
    expect(window.sessionStorage.getItem("unrelated")).toBe("1");
  });
});
