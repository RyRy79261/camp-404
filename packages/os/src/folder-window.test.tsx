import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FolderWindow, type FolderItem } from "./folder-window";

const icon = (className: string) => <svg aria-hidden className={className} />;

describe("FolderWindow", () => {
  it("lists its programs, and opening one calls that program back", () => {
    const openRoster = vi.fn();
    const openMap = vi.fn();
    const items: FolderItem[] = [
      { id: "roster", label: "Roster", icon, onOpen: openRoster },
      { id: "map", label: "Map", icon, open: true, onOpen: openMap },
    ];
    render(<FolderWindow label="Camp" items={items} />);

    const list = screen.getByRole("list", { name: "Camp" });
    expect(list.querySelectorAll("li")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Open Map" }));
    expect(openMap).toHaveBeenCalledTimes(1);
    expect(openRoster).not.toHaveBeenCalled();
  });

  it("keeps a long name readable: two lines, and whole in its tooltip", () => {
    const name = "Ministry of Magic and Mischief";
    render(
      <FolderWindow
        label="Teams"
        items={[{ id: "mom", label: name, icon, onOpen: vi.fn() }]}
      />,
    );
    const button = screen.getByRole("button", { name: `Open ${name}` });
    expect(button.getAttribute("title")).toBe(name);
    const label = button.querySelector("[data-label]")!;
    expect(label.className).toContain("line-clamp-2");
    expect(label.className).not.toContain("truncate");
  });

  it("says so when it holds nothing", () => {
    render(<FolderWindow label="Camp" items={[]} empty="Nothing here yet." />);
    expect(screen.getByText("Nothing here yet.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
