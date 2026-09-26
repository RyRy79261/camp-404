import { useRef, useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupedStartMenu, type StartMenuGroup } from "./start-menu";
import { Taskbar } from "./taskbar";
import { Tray, TrayBalloon, TrayButton, useMinuteClock } from "./tray";

const openInbox = vi.fn();
const GROUPS: StartMenuGroup[] = [
  {
    key: "me",
    label: "Me",
    items: [
      { key: "inbox", label: "Inbox", badge: 2, onSelect: openInbox },
      { key: "forms", label: "My forms", onSelect: () => {} },
    ],
  },
  {
    key: "teams",
    label: "My teams",
    items: [
      {
        key: "team:kitchen",
        label: "Kitchen team",
        tag: { text: "Lead", spoken: "you lead it" },
        onSelect: () => {},
      },
    ],
  },
  { key: "captains", label: "Captains", items: [] },
];

function Shell() {
  return (
    <Taskbar
      windows={[]}
      topId={undefined}
      onToggleWindow={() => {}}
      startLabel="Start"
      startLandmark="Console"
      renderStartMenu={({ anchor, onClose }) => (
        <nav aria-label="Console">
          <GroupedStartMenu
            groups={GROUPS}
            footer={[
              {
                key: "logoff",
                label: "Log off",
                // jsdom cannot follow a link, so the test's stops short.
                render: (props) => (
                  <a
                    href="/auth/sign-out"
                    {...props}
                    onClick={(e) => {
                      e.preventDefault();
                      props.onClick();
                    }}
                  />
                ),
              },
            ]}
            header={<p>Ada Lovelace</p>}
            label="Start"
            banner="Camp 404"
            anchor={anchor}
            onClose={onClose}
          />
        </nav>
      )}
    />
  );
}

describe("GroupedStartMenu on the taskbar", () => {
  function openStart() {
    render(<Shell />);
    const start = screen.getByRole("button", { name: "Start" });
    fireEvent.click(start);
    return start;
  }

  it("lists the programs in their named groups, skipping empty ones", () => {
    openStart();
    const menu = screen.getByRole("menu", { name: "Start" });
    expect(menu.closest("nav")?.getAttribute("aria-label")).toBe("Console");
    const groups = within(menu).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual([
      "Me",
      "My teams",
    ]);
    expect(
      within(groups[0]!).getByRole("menuitem", { name: "Inbox, 2 new" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Kitchen team, you lead it" }),
    ).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  });

  it("sits above every window and chrome, at most half the screen high on a desktop", () => {
    openStart();
    const cls = screen.getByRole("menu").className;
    expect(cls).toContain("z-[100]");
    expect(cls).toContain("md:max-h-[50dvh]");
  });

  it("draws a row as the app's own link, and still closes when it is chosen", () => {
    openStart();
    const logOff = screen.getByRole("menuitem", { name: "Log off" });
    expect(logOff.tagName).toBe("A");
    expect(logOff.getAttribute("href")).toBe("/auth/sign-out");
    fireEvent.click(logOff);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("walks every row with the arrows, and Esc goes back to Start", () => {
    const start = openStart();
    const menu = screen.getByRole("menu");
    expect(document.activeElement).toHaveProperty("textContent", "Inbox2");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Kitchen team, you lead it" }),
    );
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Log off" }),
    );
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Inbox, 2 new" }),
    );
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(start);
  });

  it("Tab leaves the menu and shuts it, focus back on Start", () => {
    const start = openStart();
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(start);
  });

  it("runs a row and closes; a press elsewhere closes it", () => {
    openStart();
    fireEvent.click(screen.getByRole("menuitem", { name: "Inbox, 2 new" }));
    expect(openInbox).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("Taskbar's Show desktop strip", () => {
  it("is there only when the app asks, and minimises through it", () => {
    const show = vi.fn();
    const { rerender } = render(
      <Taskbar
        windows={[]}
        topId={undefined}
        onToggleWindow={() => {}}
        startLabel="Start"
      />,
    );
    expect(screen.queryByRole("button", { name: "Show desktop" })).toBeNull();
    rerender(
      <Taskbar
        windows={[]}
        topId={undefined}
        onToggleWindow={() => {}}
        startLabel="Start"
        onShowDesktop={show}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show desktop" }));
    expect(show).toHaveBeenCalledTimes(1);
  });
});

describe("Tray", () => {
  it("draws its slots in a fixed order, leaving out empty ones", () => {
    render(
      <Tray
        slots={{
          clock: <span>14:02</span>,
          health: <span>!</span>,
          countdown: null,
          pins: <span>2 pinned</span>,
          inbox: (
            <TrayButton label="Inbox" count={4} countNoun="unread">
              i
            </TrayButton>
          ),
        }}
      />,
    );
    const tray = screen.getByRole("group", { name: "Tray" });
    const slots = [...tray.querySelectorAll("[data-tray]")].map((el) =>
      el.getAttribute("data-tray"),
    );
    expect(slots).toEqual(["inbox", "pins", "health", "clock"]);
    expect(
      screen.getByRole("button", { name: "Inbox, 4 unread" }),
    ).toBeTruthy();
  });

  it("draws nothing with no slots", () => {
    const { container } = render(<Tray slots={{}} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows a balloon that Esc closes, focus back on its button", () => {
    function Health() {
      const [open, setOpen] = useState(false);
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          <TrayButton
            ref={ref}
            label="System health"
            onClick={() => setOpen(true)}
          >
            !
          </TrayButton>
          <TrayBalloon open={open} onClose={() => setOpen(false)} anchor={ref}>
            Something in the app is not working right now.
          </TrayBalloon>
        </>
      );
    }
    render(<Health />);
    fireEvent.click(screen.getByRole("button", { name: "System health" }));
    expect(screen.getByRole("status").textContent).toContain("not working");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "System health" }),
    );
  });
});

describe("useMinuteClock", () => {
  it("ticks on the minute, not every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 26, 14, 2, 30));
    const seen: (string | undefined)[] = [];
    function Clock() {
      const now = useMinuteClock();
      seen.push(now?.toTimeString().slice(0, 5));
      return null;
    }
    render(<Clock />);
    const renders = seen.length;
    expect(seen.at(-1)).toBe("14:02");
    act(() => vi.advanceTimersByTime(20_000));
    expect(seen.length).toBe(renders);
    act(() => vi.advanceTimersByTime(11_000));
    expect(seen.at(-1)).toBe("14:03");
    expect(seen.length).toBe(renders + 1);
    vi.useRealTimers();
  });
});
