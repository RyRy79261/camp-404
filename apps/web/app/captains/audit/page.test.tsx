import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The audit page reads nothing for a viewer who is not a captain, and pages
// newest first for one who is.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@camp404/db/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@camp404/db/audit")>()),
  listAuditLog: vi.fn(),
}));
vi.mock("@/lib/camp-config", () => ({
  getTeamsConfig: vi.fn(async () => ({})),
  teamLabelMap: () => ({ kitchen: "Kitchen" }),
}));

import { listAuditLog } from "@camp404/db/audit";
import { captainPageGate } from "@/lib/captain-gate";
import AuditLogPage from "./page";

const CURSOR =
  "2026-09-16T09:00:00.500000~33333333-3333-4333-8333-333333333333";

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(listAuditLog).mockReset();
});

async function renderAs(cleared: boolean, before?: string) {
  vi.mocked(captainPageGate).mockResolvedValue({
    rank: cleared ? "captain" : "team_lead",
    cleared,
  } as never);
  render(await AuditLogPage({ searchParams: Promise.resolve({ before }) }));
}

describe("audit log page", () => {
  it("locks a viewer who is not a captain and reads no row", async () => {
    await renderAs(false);
    expect(screen.getByText(/audit log is captain-only/)).toBeTruthy();
    expect(listAuditLog).not.toHaveBeenCalled();
  });

  it("shows a captain the rows and a link to older ones", async () => {
    vi.mocked(listAuditLog).mockResolvedValue({
      rows: [
        {
          id: "r1",
          action: "member.team_assigned",
          actorId: null,
          actorName: null,
          target: "22222222-2222-4222-8222-222222222222",
          targetName: "Mem Ber",
          metadata: { team: "kitchen" },
          createdAt: new Date("2026-09-01T10:00:00Z"),
        },
      ],
      nextCursor: CURSOR,
    });
    await renderAs(true);
    const table = screen.getByRole("table", { name: "Audit log" });
    expect(within(table).getByText("Added a member to a team")).toBeTruthy();
    expect(within(table).getByText("The app")).toBeTruthy();
    expect(within(table).getByText("Kitchen")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Older" }).getAttribute("href"),
    ).toBe(`/captains/audit?before=${encodeURIComponent(CURSOR)}`);
    expect(screen.queryByRole("link", { name: "Newest" })).toBeNull();
  });

  it("ignores a cursor it did not make", async () => {
    vi.mocked(listAuditLog).mockResolvedValue({ rows: [], nextCursor: null });
    await renderAs(true, "not-a-cursor");
    expect(listAuditLog).toHaveBeenCalledWith({ before: null });
    expect(screen.getByText("Nothing recorded yet")).toBeTruthy();
  });

  it("offers the newest page from an older one", async () => {
    vi.mocked(listAuditLog).mockResolvedValue({ rows: [], nextCursor: null });
    await renderAs(true, CURSOR);
    expect(listAuditLog).toHaveBeenCalledWith({ before: CURSOR });
    expect(screen.getByText("No older entries")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Newest" }).getAttribute("href"),
    ).toBe("/captains/audit");
  });
});
