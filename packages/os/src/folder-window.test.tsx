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

  it("marks a team the member leads, counts what is new, and pins a footer under the icons", () => {
    render(
      <FolderWindow
        label="Teams"
        items={[
          {
            id: "team:kitchen",
            label: "Kitchen",
            icon,
            badge: 3,
            tag: { text: "Lead", spoken: "you lead it", strong: true },
            onOpen: vi.fn(),
          },
          {
            id: "team:sound",
            label: "Sound",
            icon,
            tag: { text: "Mine", spoken: "your team" },
            onOpen: vi.fn(),
          },
        ]}
        footer={<p>The art piece</p>}
      />,
    );
    const kitchen = screen.getByRole("button", {
      name: "Open Kitchen, you lead it, 3 new",
    });
    expect(kitchen.querySelector("[data-tag]")?.textContent).toBe("Lead");
    expect(
      screen.getByRole("button", { name: "Open Sound, your team" }),
    ).toBeTruthy();
    const footer = screen.getByText("The art piece").parentElement!;
    expect(footer.className).toContain("sticky");
    expect(footer.className).toContain("bottom-0");
  });
});
