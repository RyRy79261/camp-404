import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { ViewerRank } from "@camp404/types";
import { matchProgram } from "@/lib/program-routes";
import { recentStorageKey } from "@/lib/program-search";
import {
  buildProgramManifest,
  type ClientProgram,
  type ProgramManifest,
} from "@/lib/programs";
import { ProgramSearch } from "../program-search";

// The Ctrl+K box (issue #326, step 1), alone: the shortcut, the keyboard,
// Esc giving focus back, Enter opening the program the Start menu's way, and
// Recent. The rank filter itself is the manifest's (program-search.test.ts).

beforeAll(() => {
  // cmdk scrolls the picked row into view; JSDOM has no layout.
  Element.prototype.scrollIntoView ??= () => {};
});

const USER = "user-1";

function manifest(rank: ViewerRank = ViewerRank.enum.camp_member) {
  return buildProgramManifest({
    mode: "full",
    approved: true,
    rank,
    memberships: [],
    teams: DEFAULT_TEAMS,
    hasLift: false,
    inbox: 0,
    healthWarnings: 0,
  });
}

function Harness({
  m,
  onOpenProgram,
  liveKey = null,
}: {
  m: ProgramManifest;
  onOpenProgram: (p: ClientProgram) => void;
  liveKey?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button">Before</button>
      <div contentEditable suppressContentEditableWarning data-testid="editor">
        <p>text</p>
      </div>
      <ProgramSearch
        manifest={m}
        userId={USER}
        liveKey={liveKey}
        open={open}
        onOpenChange={setOpen}
        onOpenProgram={onOpenProgram}
      />
    </>
  );
}

const ctrlK = (target: Element | Window = window) =>
  fireEvent.keyDown(target, { key: "k", ctrlKey: true });
const dialog = () => screen.queryByRole("dialog", { name: "Search programs" });
const field = () => within(dialog()!).getByRole("combobox");
const picked = () =>
  dialog()!.querySelector<HTMLElement>('[aria-selected="true"]');

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("ProgramSearch", () => {
  it("opens on Ctrl+K and on Cmd+K, with the field in focus", () => {
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    expect(dialog()).toBeNull();
    ctrlK();
    expect(dialog()).not.toBeNull();
    expect(document.activeElement).toBe(field());
    // Ctrl+K again shuts it.
    ctrlK(field());
    expect(dialog()).toBeNull();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(dialog()).not.toBeNull();
  });

  it("leaves Ctrl+K to a rich-text editor", () => {
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    const inside = screen.getByTestId("editor").querySelector("p")!;
    ctrlK(inside);
    expect(dialog()).toBeNull();
  });

  it("filters as you type; arrows move; Enter opens the picked program", () => {
    const open = vi.fn();
    render(<Harness m={manifest()} onOpenProgram={open} />);
    ctrlK();
    fireEvent.change(field(), { target: { value: "pow" } });
    expect(picked()?.getAttribute("aria-label")).toMatch(/^Power, /);
    // The match is highlighted.
    expect(picked()!.querySelector("mark")?.textContent).toBe("Pow");
    expect(screen.getByRole("status")?.textContent).toMatch(/programs? found/);

    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(picked()?.getAttribute("aria-label")).toMatch(
      /^Power and Lighting, /,
    );
    fireEvent.keyDown(field(), { key: "ArrowUp" });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]![0].href).toBe("/power");
    expect(dialog()).toBeNull();
  });

  it("says so when nothing matches, and never lists a captain's program to a member", () => {
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    ctrlK();
    fireEvent.change(field(), { target: { value: "camp" } });
    // Present first, then the absence.
    expect(
      within(dialog()!).getByRole("option", { name: /^Camp layout, / }),
    ).toBeTruthy();
    expect(
      within(dialog()!).queryByRole("option", { name: /^Camp settings, / }),
    ).toBeNull();
    fireEvent.change(field(), { target: { value: "audit" } });
    expect(dialog()?.textContent).toMatch(/Search finds programs for now/);
  });

  it("Esc shuts it and gives focus back to where it was", () => {
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    const before = screen.getByRole("button", { name: "Before" });
    before.focus();
    ctrlK(before);
    expect(document.activeElement).toBe(field());
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  it("lists the programs opened last when the box is empty", () => {
    const m = manifest();
    const power = matchProgram("/power/loads")!.instanceKey;
    const { rerender } = render(
      <Harness m={m} onOpenProgram={vi.fn()} liveKey={null} />,
    );
    rerender(<Harness m={m} onOpenProgram={vi.fn()} liveKey={power} />);
    expect(
      JSON.parse(window.localStorage.getItem(recentStorageKey(USER))!),
    ).toEqual(["power"]);
    act(() => {
      ctrlK();
    });
    expect(within(dialog()!).getByText("Recent")).toBeTruthy();
    const rows = within(dialog()!).getAllByRole("option");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute("aria-label")).toMatch(/^Power, /);
  });
});
