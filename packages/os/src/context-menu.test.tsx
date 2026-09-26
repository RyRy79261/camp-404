import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ContextMenu,
  type ContextMenuEntry,
  type ContextMenuState,
} from "./context-menu";
import { FolderNameDialog } from "./folder-name-dialog";

function Harness({
  entries,
  onClose = () => {},
}: {
  entries: ContextMenuEntry[];
  onClose?: (refocus: boolean) => void;
}) {
  const [menu, setMenu] = useState<ContextMenuState>(null);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.focus();
          setMenu({ x: 10, y: 20, entries });
        }}
      >
        Icon
      </button>
      <ContextMenu
        menu={menu}
        onClose={(refocus) => {
          setMenu(null);
          onClose(refocus);
        }}
      />
    </>
  );
}

const rows = () => screen.getAllByRole("menuitem");

describe("ContextMenu", () => {
  const open = vi.fn();
  const del = vi.fn();
  const ENTRIES: ContextMenuEntry[] = [
    { label: "Open", bold: true, onSelect: open },
    "divider",
    { label: "Add to Mine", disabled: true, onSelect: () => {} },
    { label: "Add to a new folder", onSelect: () => {} },
    "divider",
    { label: "Delete shortcut", danger: true, onSelect: del },
  ];

  function openMenu() {
    render(<Harness entries={ENTRIES} />);
    const opener = screen.getByRole("button", { name: "Icon" });
    act(() => opener.focus());
    fireEvent.click(opener);
    return opener;
  }

  it("is a named menu, with focus on its first row", () => {
    openMenu();
    const menu = screen.getByRole("menu", { name: "Actions" });
    expect(menu.style.left).toBe("10px");
    expect(document.activeElement).toBe(rows()[0]);
    expect(screen.getAllByRole("separator")).toHaveLength(2);
    expect(rows()[0]!.className).toContain("font-semibold");
    expect(rows()[3]!.className).toContain("text-os-danger");
  });

  it("walks the rows with the arrows, skipping disabled ones and wrapping", () => {
    openMenu();
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toHaveProperty(
      "textContent",
      "Add to a new folder",
    );
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toHaveProperty("textContent", "Open");
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toHaveProperty(
      "textContent",
      "Delete shortcut",
    );
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toHaveProperty("textContent", "Open");
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toHaveProperty(
      "textContent",
      "Delete shortcut",
    );
  });

  it("closes on Esc and hands focus back to the icon", () => {
    const opener = openMenu();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("runs a row and closes", () => {
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete shortcut" }));
    expect(del).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on a press elsewhere", () => {
    const onClose = vi.fn();
    render(<Harness entries={ENTRIES} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Icon" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("draws nothing without a menu", () => {
    const { container } = render(
      <ContextMenu menu={null} onClose={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("FolderNameDialog", () => {
  it("asks for a new folder's name with the field empty, and saves it cleaned", () => {
    const onSave = vi.fn();
    render(
      <FolderNameDialog
        open
        fresh
        name="New folder"
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Name your new folder" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const field = screen.getByLabelText("Folder name") as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.maxLength).toBe(24);
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "  Kitchen   bits " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Kitchen bits");
  });

  it("keeps the old name when a rename is left blank, and Esc cancels", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <FolderNameDialog
        open
        fresh={false}
        name="Mine"
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    screen.getByRole("dialog", { name: "Rename this folder" });
    const field = screen.getByLabelText("Folder name") as HTMLInputElement;
    expect(field.value).toBe("Mine");
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.submit(field.closest("form")!);
    expect(onSave).toHaveBeenCalledWith("Mine");
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps Tab inside", () => {
    render(
      <FolderNameDialog
        open
        fresh
        name="x"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const save = screen.getByRole("button", { name: "Save" });
    act(() => save.focus());
    fireEvent.keyDown(save, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByLabelText("Folder name"));
  });

  it("is not there when closed", () => {
    render(
      <FolderNameDialog
        open={false}
        fresh
        name="x"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
