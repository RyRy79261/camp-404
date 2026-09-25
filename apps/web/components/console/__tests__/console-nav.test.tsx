import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NavNode } from "@/lib/console-nav";

// The router's pending state for a link, driven by the test.
const link = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/link")>()),
  useLinkStatus: () => ({ pending: link.pending }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/tasks" }));

import { ConsoleNav } from "../console-nav";

const NODES: NavNode[] = [
  { kind: "link", href: "/", label: "Home" },
  { kind: "link", href: "/tasks", label: "Tasks" },
  {
    kind: "group",
    label: "Camp",
    sections: [[{ href: "/family-tree", label: "Family tree" }]],
  },
];

afterEach(() => {
  cleanup();
  link.pending = false;
});

describe("ConsoleNav phone sheet", () => {
  it("closes when a link's load ends, even when the address never changes (a redirect back here)", () => {
    const view = render(<ConsoleNav nodes={NODES} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();

    // A tile is pressed: its load starts, and the sheet stays open to pulse.
    link.pending = true;
    view.rerender(<ConsoleNav nodes={NODES} />);
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();

    // The load ends on the same address: the sheet closes anyway.
    link.pending = false;
    act(() => view.rerender(<ConsoleNav nodes={NODES} />));
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
  });

  it("stays open while nothing has loaded", () => {
    const view = render(<ConsoleNav nodes={NODES} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    view.rerender(<ConsoleNav nodes={NODES} />);
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
  });
});
