import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DesktopIcons,
  iconName,
  type DesktopIconItem,
  type DesktopMenuRequest,
} from "./desktop-icons";
import { DEFAULT_GEOMETRY, type Cells, type DefaultSpec } from "./icon-grid";

const { pad, cell } = DEFAULT_GEOMETRY;
const SIZE = { cols: 8, rows: 5 };
const glyph = (className: string) => <svg className={className} />;

const ITEMS: DesktopIconItem[] = [
  { key: "inbox", label: "Inbox", icon: glyph, badge: 3, droppable: true },
  { key: "tasks", label: "Tasks", icon: glyph, droppable: true },
  { key: "roster", label: "Roster", icon: glyph, droppable: true },
  { key: "team:kitchen", label: "Kitchen team", icon: glyph, lead: true },
  {
    key: "sc-1",
    label: "Roster",
    icon: glyph,
    shortcut: true,
    droppable: true,
  },
  { key: "uf-1", label: "Mine", icon: glyph, count: 2, acceptsDrop: true },
];
// Inbox (0,0) Tasks (0,1) | Roster (1,0) | Kitchen team down the right (7,0);
// the member's shortcut and folder in the first free cells, (0,2) and (0,3).
const SPEC: DefaultSpec = {
  columns: [["inbox", "tasks"], ["roster"]],
  right: ["team:kitchen"],
};

/** The screen point at the middle of a cell. */
const at = (c: number, r: number) => ({
  clientX: pad + c * cell.w + cell.w / 2,
  clientY: pad + r * cell.h + cell.h / 2,
});

function Harness({
  onOpen = () => {},
  onDrop,
  onMenu,
  initial = {},
}: {
  onOpen?: (key: string) => void;
  onDrop?: (folder: string, key: string) => void;
  onMenu?: (r: DesktopMenuRequest) => void;
  initial?: Cells;
}) {
  const [cells, setCells] = useState<Cells>(initial);
  return (
    <>
      <DesktopIcons
        items={ITEMS}
        spec={SPEC}
        cells={cells}
        size={SIZE}
        onCellsChange={setCells}
        onOpen={onOpen}
        onDropIntoFolder={onDrop}
        onContextMenu={onMenu}
      />
      <output data-testid="cells">{JSON.stringify(cells)}</output>
    </>
  );
}

const icon = (name: RegExp | string) => screen.getByRole("option", { name });
const selectedNames = () =>
  screen
    .getAllByRole("option")
    .filter((o) => o.getAttribute("aria-selected") === "true")
    .map((o) => o.getAttribute("aria-label"));
const cellOf = (el: HTMLElement) => ({
  c: (parseFloat(el.style.left) - pad) / cell.w,
  r: (parseFloat(el.style.top) - pad) / cell.h,
});

/** Press on an icon (or the desktop), move to `to`, let go. */
function drag(
  el: HTMLElement,
  from: { clientX: number; clientY: number },
  to: { clientX: number; clientY: number },
  mods: { ctrlKey?: boolean } = {},
) {
  fireEvent.pointerDown(el, { button: 0, ...from, ...mods });
  fireEvent.pointerMove(window, to);
  fireEvent.pointerUp(window, to);
}

function click(
  el: HTMLElement,
  mods: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {},
) {
  const r = { clientX: 1, clientY: 1 };
  fireEvent.pointerDown(el, { button: 0, ...r, ...mods });
  fireEvent.pointerUp(window, r);
}

describe("DesktopIcons", () => {
  it("names each icon with its marks: badge, LEAD, shortcut, folder count", () => {
    render(<Harness />);
    expect(screen.getByRole("listbox", { name: "Desktop" })).toHaveProperty(
      "ariaMultiSelectable",
      "true",
    );
    expect(icon("Inbox, 3 new")).toBeTruthy();
    expect(icon("Kitchen team, you lead it")).toBeTruthy();
    expect(icon("Roster, shortcut")).toBeTruthy();
    expect(icon("Mine, 2 items")).toBeTruthy();
    // The marks are drawn but not read twice.
    const kitchen = icon(/Kitchen team/);
    expect(
      kitchen.querySelector("[data-lead]")?.closest("[aria-hidden]"),
    ).toBeTruthy();
    expect(
      icon("Roster, shortcut").querySelector("[data-shortcut]"),
    ).toBeTruthy();
    expect(icon("Roster").querySelector("[data-shortcut]")).toBeNull();
  });

  it("lays out the default: groups from the left, team folders on the right, member items after", () => {
    render(<Harness />);
    expect(cellOf(icon(/Inbox/))).toEqual({ c: 0, r: 0 });
    expect(cellOf(icon("Tasks"))).toEqual({ c: 0, r: 1 });
    expect(cellOf(icon("Roster"))).toEqual({ c: 1, r: 0 });
    expect(cellOf(icon(/Kitchen team/))).toEqual({ c: 7, r: 0 });
    expect(cellOf(icon("Roster, shortcut"))).toEqual({ c: 0, r: 2 });
    expect(cellOf(icon(/Mine/))).toEqual({ c: 0, r: 3 });
  });

  it("selects on click, adds with Ctrl, Cmd or Shift, and never opens on one click", () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    click(icon(/Inbox/));
    expect(selectedNames()).toEqual(["Inbox, 3 new"]);
    click(icon("Tasks"));
    expect(selectedNames()).toEqual(["Tasks"]);
    click(icon("Roster"), { ctrlKey: true });
    click(icon(/Mine/), { shiftKey: true });
    click(icon(/Inbox/), { metaKey: true });
    expect(selectedNames()).toHaveLength(4);
    // Ctrl on a selected icon takes it out.
    click(icon("Roster"), { ctrlKey: true });
    expect(selectedNames()).not.toContain("Roster");
    // A plain click on one of several keeps just it.
    click(icon("Tasks"));
    expect(selectedNames()).toEqual(["Tasks"]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("opens on double-click and on Enter", () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    fireEvent.doubleClick(icon("Tasks"));
    fireEvent.keyDown(icon("Roster"), { key: "Enter" });
    expect(onOpen.mock.calls).toEqual([["tasks"], ["roster"]]);
  });

  it("opens on a double tap (a tablet), once, and never on one tap or a mouse", () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    const tap = (el: HTMLElement, pointerType: string) => {
      const r = { clientX: 1, clientY: 1 };
      fireEvent.pointerDown(el, { button: 0, pointerType, ...r });
      fireEvent.pointerUp(window, r);
    };
    tap(icon("Tasks"), "touch");
    expect(onOpen).not.toHaveBeenCalled();
    tap(icon("Tasks"), "touch");
    expect(onOpen.mock.calls).toEqual([["tasks"]]);
    // The dblclick a browser may send after the second tap opens nothing more.
    fireEvent.doubleClick(icon("Tasks"));
    expect(onOpen.mock.calls).toEqual([["tasks"]]);
    // Two taps on two icons open neither; two mouse clicks open nothing.
    onOpen.mockClear();
    tap(icon("Roster"), "touch");
    tap(icon(/Inbox/), "touch");
    tap(icon("Roster"), "mouse");
    tap(icon("Roster"), "mouse");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("clears the selection on a click on the empty desktop, and on Esc", () => {
    render(<Harness />);
    const desktop = screen.getByRole("listbox");
    click(icon("Tasks"));
    click(desktop);
    expect(selectedNames()).toEqual([]);
    click(icon("Tasks"));
    fireEvent.keyDown(icon("Tasks"), { key: "Escape" });
    expect(selectedNames()).toEqual([]);
  });

  it("selects every icon a box drawn on the empty desktop touches", () => {
    render(<Harness />);
    const desktop = screen.getByRole("listbox");
    // From just inside Inbox's cell's corner gap down across Tasks.
    drag(desktop, { clientX: pad + 2, clientY: pad + 2 }, at(0, 1));
    expect(selectedNames()).toEqual(["Inbox, 3 new", "Tasks"]);
  });

  it("drags the selection to new cells, snapping; an icon in the way moves aside", () => {
    render(<Harness />);
    click(icon(/Inbox/));
    click(icon("Tasks"), { ctrlKey: true });
    // Drag Inbox 3 cells right and 1 down (a little off-centre: it snaps).
    drag(icon(/Inbox/), at(0, 0), {
      clientX: at(3, 1).clientX + 20,
      clientY: at(3, 1).clientY - 30,
    });
    expect(cellOf(icon(/Inbox/))).toEqual({ c: 3, r: 1 });
    expect(cellOf(icon("Tasks"))).toEqual({ c: 3, r: 2 });
    // No slide: nothing is left translated.
    expect(icon(/Inbox/).style.transform).toBe("");

    // Roster onto Tasks' cell: Tasks goes to the nearest free cell.
    click(icon("Roster"));
    drag(icon("Roster"), at(1, 0), at(3, 2));
    expect(cellOf(icon("Roster"))).toEqual({ c: 3, r: 2 });
    const tasks = cellOf(icon("Tasks"));
    expect(Math.abs(tasks.c - 3) + Math.abs(tasks.r - 2)).toBe(1);
    const saved = JSON.parse(screen.getByTestId("cells").textContent!);
    expect(saved.roster).toEqual({ c: 3, r: 2 });
  });

  it("does not move on a press that stays put", () => {
    render(<Harness />);
    drag(icon("Tasks"), at(0, 1), {
      clientX: at(0, 1).clientX + 3,
      clientY: at(0, 1).clientY,
    });
    expect(screen.getByTestId("cells").textContent).toBe("{}");
  });

  it("drops one program or shortcut onto a member folder instead of moving it", () => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    drag(icon("Roster, shortcut"), at(0, 2), at(0, 3));
    expect(onDrop).toHaveBeenCalledWith("uf-1", "sc-1");
    expect(cellOf(icon("Roster, shortcut"))).toEqual({ c: 0, r: 2 });
    // A team folder is not droppable: it just moves there.
    drag(icon(/Kitchen team/), at(7, 0), at(0, 3));
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(cellOf(icon(/Kitchen team/))).toEqual({ c: 0, r: 3 });
  });

  it("keeps a saved layout, and puts back what no longer fits", () => {
    render(
      <Harness initial={{ inbox: { c: 5, r: 4 }, tasks: { c: 40, r: 0 } }} />,
    );
    expect(cellOf(icon(/Inbox/))).toEqual({ c: 5, r: 4 });
    expect(cellOf(icon("Tasks"))).toEqual({ c: 0, r: 1 });
  });

  it("is one tab stop, with arrow keys moving focus and Space selecting", () => {
    render(<Harness />);
    const stops = screen.getAllByRole("option").filter((o) => o.tabIndex === 0);
    expect(stops.map((o) => o.getAttribute("aria-label"))).toEqual([
      "Inbox, 3 new",
    ]);
    act(() => icon(/Inbox/).focus());
    fireEvent.keyDown(icon(/Inbox/), { key: "ArrowDown" });
    expect(document.activeElement).toBe(icon("Tasks"));
    expect(icon("Tasks").tabIndex).toBe(0);
    expect(icon(/Inbox/).tabIndex).toBe(-1);
    fireEvent.keyDown(icon("Tasks"), { key: " " });
    expect(selectedNames()).toEqual(["Tasks"]);
    // Shift with an arrow adds.
    fireEvent.keyDown(icon("Tasks"), { key: "ArrowRight", shiftKey: true });
    expect(document.activeElement).toBe(icon("Roster"));
    expect(selectedNames().sort()).toEqual(["Roster", "Tasks"]);
    fireEvent.keyDown(icon("Roster"), { key: "End" });
    expect(document.activeElement).toBe(icon(/Kitchen team/));
  });

  it("asks for the menu on right-click, Shift+F10 and the Menu key, and on the empty desktop", () => {
    const onMenu = vi.fn();
    render(<Harness onMenu={onMenu} />);
    fireEvent.contextMenu(icon("Tasks"), { clientX: 40, clientY: 50 });
    expect(onMenu).toHaveBeenLastCalledWith({
      key: "tasks",
      selected: ["tasks"],
      x: 40,
      y: 50,
    });
    expect(selectedNames()).toEqual(["Tasks"]);

    fireEvent.keyDown(icon("Roster"), { key: "F10", shiftKey: true });
    expect(onMenu).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: "roster", selected: ["roster"] }),
    );
    // The browser's own contextmenu right after is not a second request.
    fireEvent.contextMenu(icon("Roster"));
    expect(onMenu).toHaveBeenCalledTimes(2);

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5000);
    fireEvent.keyDown(icon("Tasks"), { key: "ContextMenu" });
    expect(onMenu).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: "tasks" }),
    );
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10000);
    fireEvent.contextMenu(screen.getByRole("listbox"), {
      clientX: 5,
      clientY: 6,
    });
    expect(onMenu).toHaveBeenLastCalledWith({
      key: null,
      selected: [],
      x: 5,
      y: 6,
    });
    expect(selectedNames()).toEqual([]);
    vi.restoreAllMocks();
  });

  it("takes a real right-click soon after Shift+F10 as a new request", () => {
    const onMenu = vi.fn();
    render(<Harness onMenu={onMenu} />);
    fireEvent.keyDown(icon("Roster"), { key: "F10", shiftKey: true });
    expect(onMenu).toHaveBeenCalledTimes(1);
    // Well inside the echo window, but a pointer went down first: a mouse
    // right-click on the empty desktop, not the keyboard's echo.
    const desk = screen.getByRole("listbox");
    fireEvent.pointerDown(desk, { button: 2 });
    fireEvent.contextMenu(desk, { clientX: 7, clientY: 8 });
    expect(onMenu).toHaveBeenCalledTimes(2);
    expect(onMenu).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: null, x: 7, y: 8 }),
    );
  });

  it("marks an open program and a pending one", () => {
    render(
      <DesktopIcons
        items={[
          { key: "a", label: "A", icon: glyph, open: true },
          { key: "b", label: "B", icon: glyph, pending: true },
        ]}
        spec={{ columns: [["a", "b"]] }}
        cells={{}}
        size={SIZE}
        onCellsChange={() => {}}
        onOpen={() => {}}
      />,
    );
    // The label is drawn by CSS from data-label (never page text).
    const label = icon("A").querySelector("[data-label]");
    expect(label?.getAttribute("data-label")).toBe("A");
    expect(icon("A").textContent).not.toContain("A");
    expect(label?.className).toContain("bg-os-primary");
    expect(icon("B").className).toContain("os-pending");
    expect(icon("A").className).not.toContain("os-pending");
  });

  it("builds a plain name when none is given, and uses one that is", () => {
    expect(iconName({ key: "k", label: "Mine", icon: glyph, count: 1 })).toBe(
      "Mine, 1 item",
    );
    expect(
      iconName({ key: "k", label: "Mine", icon: glyph, ariaLabel: "Custom" }),
    ).toBe("Custom");
  });
});
