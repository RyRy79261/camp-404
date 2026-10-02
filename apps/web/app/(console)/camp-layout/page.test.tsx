import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The camp layout page (#271; the approved redesign, 2026-10-01). Every
// approved member reads the plan, its numbered key and the rail; a captain or
// a Structures lead edits it; everyone else gets NO tools at all (the audit:
// a greyed-out toolbar read as a broken form). The neighbour link is read
// only for a captain, so no one else's page ever holds it.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(console)/camp-layout/actions", () => ({
  saveLayoutAction: vi.fn(),
  restoreLayoutVersionAction: vi.fn(),
  copyLastYearLayoutAction: vi.fn(),
  shareLayoutAction: vi.fn(),
  unshareLayoutAction: vi.fn(),
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/camp-layout", () => ({
  getCampLayout: vi.fn(),
  getLayoutShare: vi.fn(),
  layoutArrivalCounts: vi.fn(async () => []),
  listLayoutVersions: vi.fn(async () => []),
  previousLayoutCycle: vi.fn(async () => null),
}));

import { LAYOUT_TEAM, emptyLayout, newPiece } from "@camp404/core";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getCampLayout,
  getLayoutShare,
  layoutArrivalCounts,
  listLayoutVersions,
} from "@/lib/camp-layout";
import { LAYOUT_PRINT_PATH } from "@/lib/camp-layout-copy";
import { getLeadTeams } from "@/lib/users";
import CampLayoutPage from "./page";

const TOKEN = "k".repeat(32);

function plan() {
  const layout = emptyLayout();
  return {
    ...layout,
    pieces: [
      { ...newPiece("kitchen", "p-1", layout.plot), label: "Main kitchen" },
    ],
  };
}

async function renderAs(
  rank: "camp_member" | "team_lead" | "captain",
  leads: string[] = [],
  version?: string,
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads);
  render(await CampLayoutPage({ searchParams: Promise.resolve({ version }) }));
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCampLayout).mockResolvedValue({
    cycle: 2027,
    version: 2,
    layout: plan(),
    note: null,
    savedAt: new Date("2027-03-01T10:00:00Z"),
    savedByName: "Sipho",
    shared: true,
  });
  vi.mocked(getLayoutShare).mockResolvedValue({
    token: TOKEN,
    sharedAt: new Date(),
  });
  vi.mocked(listLayoutVersions).mockResolvedValue([
    {
      number: 2,
      note: null,
      savedAt: new Date("2027-03-01T10:00:00Z"),
      savedByName: "Sipho",
      pieces: 1,
    },
    {
      number: 1,
      note: "First go",
      savedAt: new Date("2027-02-01T10:00:00Z"),
      savedByName: "Sipho",
      pieces: 0,
    },
  ]);
  vi.mocked(layoutArrivalCounts).mockResolvedValue([
    { day: "2027-04-26", count: 3 },
  ]);
});

describe("the camp layout page", () => {
  it("shows a member the plan, its key and the rail, with no tools at all", async () => {
    await renderAs("camp_member");
    // Present first: the plan, the piece in the key, the reader's tab.
    expect(
      screen.getByRole("img", { name: /Camp layout: a plot 28 m wide/ }),
    ).toBeTruthy();
    const key = screen.getByRole("list", { name: "Camp pieces" });
    expect(within(key).getByText("Main kitchen")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "This plan" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Print plan \(A4\)/ })
        .getAttribute("href"),
    ).toBe(LAYOUT_PRINT_PATH);
    // Then the absences: no toolbar, no piece tab, no save, no link.
    expect(screen.queryByRole("toolbar", { name: "Layout tools" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add piece/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Piece" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Share" })).toBeNull();
    expect(screen.queryByText(/No changes yet/)).toBeNull();
    expect(getLayoutShare).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue(new RegExp(TOKEN))).toBeNull();
    expect(screen.getByText(/Shared with neighbours$/)).toBeTruthy();
  });

  it("gives a Structures lead the tools and the piece tab, but no neighbour link", async () => {
    await renderAs("team_lead", [LAYOUT_TEAM]);
    expect(screen.getByRole("toolbar", { name: "Layout tools" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add piece/ })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Piece" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText(/No changes yet/)).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Share" })).toBeNull();
    expect(getLayoutShare).not.toHaveBeenCalled();
  });

  it("refuses a Kitchen lead as it refuses a member", async () => {
    await renderAs("team_lead", ["kitchen"]);
    expect(screen.getByRole("tab", { name: "This plan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add piece/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Piece" })).toBeNull();
  });

  it("gives a captain the neighbour link in its own tab", async () => {
    await renderAs("captain");
    expect(getLayoutShare).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Share" }));
    const panel = screen.getByRole("tabpanel");
    expect(
      within(panel).getByText(/Shared with neighbours since/),
    ).toBeTruthy();
    expect(
      within(panel).getByRole("button", { name: /Stop sharing/ }),
    ).toBeTruthy();
    expect(within(panel).getByLabelText("Neighbour link")).toBeTruthy();
  });

  it("shows the arrival counts to everyone", async () => {
    await renderAs("camp_member");
    fireEvent.click(screen.getByRole("tab", { name: "Arrivals" }));
    const list = screen.getByRole("list", { name: "Arrivals by day" });
    expect(list.textContent).toContain("Mon 26 Apr");
    expect(list.textContent).toContain("3");
    expect(screen.getByText(/people arriving over 1 day/)).toBeTruthy();
  });

  it("puts Bring back on the banner of an older version, for an editor only", async () => {
    vi.mocked(getCampLayout).mockImplementation(async (_cycle, version) => ({
      cycle: 2027,
      version: version ?? 2,
      layout: plan(),
      note: null,
      savedAt: new Date("2027-03-01T10:00:00Z"),
      savedByName: "Sipho",
      shared: false,
    }));
    await renderAs("team_lead", [LAYOUT_TEAM], "1");
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("version 1");
    expect(
      within(banner).getByRole("button", { name: "Bring back version 1" }),
    ).toBeTruthy();
    expect(
      within(banner).getByRole("link", { name: "Back to the latest" }),
    ).toBeTruthy();
    // An old plan is read, not drawn on.
    expect(screen.queryByRole("toolbar", { name: "Layout tools" })).toBeNull();
    cleanup();

    await renderAs("camp_member", [], "1");
    expect(screen.getByRole("status").textContent).toContain("version 1");
    expect(screen.queryByRole("button", { name: /Bring back/ })).toBeNull();
  });

  it("lists every version with one View in the same slot", async () => {
    await renderAs("camp_member");
    fireEvent.click(screen.getByRole("tab", { name: "Versions" }));
    const list = screen.getByRole("list", { name: "Saved versions" });
    expect(within(list).getByText("Showing")).toBeTruthy();
    expect(
      within(list)
        .getByRole("link", { name: "View version 1" })
        .getAttribute("href"),
    ).toBe("/camp-layout?version=1");
  });
});
