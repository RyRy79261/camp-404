import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The captains' Report screenshots page (#313): a member or a team lead gets
// the lock and nothing is read; a captain gets the list, opens a picture, and
// deletes it after a confirmation.

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/captain-gate", () => ({
  captainPageGate: vi.fn(),
  captainActionGate: vi.fn(),
}));
vi.mock("@/lib/report-screenshots", () => ({
  listReportScreenshots: vi.fn(),
  clearStaleUnfiledScreenshots: vi.fn(),
  removeReportScreenshot: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { after } from "next/server";
import { captainActionGate, captainPageGate } from "@/lib/captain-gate";
import {
  listReportScreenshots,
  removeReportScreenshot,
} from "@/lib/report-screenshots";
import ReportScreenshotsPage from "./page";
import { deleteReportScreenshotAction } from "./actions";

const ROW = {
  id: "6f1c1d8e-2b1a-4c55-9a77-0d3c1f6b9e21",
  userId: "member-1",
  fromName: "Thandeka Dlamini",
  issueNumber: 412,
  issueUrl: "https://github.com/RyRy79261/camp-404/issues/412",
  reportTitle: "Waiting list button won't save",
  reportText: "I pressed Waiting list on Pieter and it said it couldn't save.",
  filedAt: new Date("2026-09-29T08:14:00Z"),
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

async function renderAs(rank: "captain" | "team_lead" | "camp_member") {
  vi.mocked(captainPageGate).mockResolvedValue({
    rank,
    cleared: rank === "captain",
    campUser: { id: "me" },
  } as never);
  render(await ReportScreenshotsPage());
}

describe("Report screenshots page", () => {
  for (const rank of ["camp_member", "team_lead"] as const) {
    it(`locks a ${rank} and reads nothing`, async () => {
      await renderAs(rank);
      expect(screen.getByText(/captain-only/)).toBeTruthy();
      expect(listReportScreenshots).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
      expect(screen.queryByRole("img")).toBeNull();
    });
  }

  it("asks for a captain's rank", async () => {
    vi.mocked(listReportScreenshots).mockResolvedValue([]);
    await renderAs("captain");
    expect(screen.getByText("No screenshots.")).toBeTruthy();
    expect(captainPageGate).toHaveBeenCalledWith("captain");
  });

  it("lists a captain's screenshots, marked private, and opens one", async () => {
    vi.mocked(listReportScreenshots).mockResolvedValue([ROW]);
    await renderAs("captain");
    const row = screen.getByRole("listitem", {
      name: "Waiting list button won't save",
    });
    expect(row.closest("[data-os-private]")).toBeTruthy();
    // The small picture comes from the audited route, marked as a glance.
    expect(within(row).getByRole("img").getAttribute("src")).toBe(
      `/api/report-screenshot/${ROW.id}?view=list`,
    );
    expect(within(row).getByText(/Issue #412/)).toBeTruthy();
    expect(within(row).getAllByText(/Thandeka Dlamini/).length).toBeGreaterThan(
      0,
    );

    fireEvent.click(within(row).getByRole("button", { name: "Open" }));
    expect(
      within(row)
        .getByRole("img", { name: /full size/ })
        .getAttribute("src"),
    ).toBe(`/api/report-screenshot/${ROW.id}`);
    expect(within(row).getByText(ROW.reportText)).toBeTruthy();
    expect(
      within(row)
        .getByRole("link", { name: /View issue #412 on GitHub/ })
        .getAttribute("href"),
    ).toBe(ROW.issueUrl);
  });

  it("deletes only after the confirmation", async () => {
    vi.mocked(listReportScreenshots).mockResolvedValue([ROW]);
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: true,
      rank: "captain",
      campUser: { id: "captain-1" },
    } as never);
    await renderAs("captain");
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete screenshot" }));
    const confirm = screen.getByRole("group", {
      name: "Delete this screenshot?",
    });
    expect(within(confirm).getByText(/The GitHub issue stays/)).toBeTruthy();
    expect(removeReportScreenshot).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Delete screenshot" }),
    );
    await waitFor(() =>
      expect(removeReportScreenshot).toHaveBeenCalledWith({
        id: ROW.id,
        actorId: "captain-1",
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("No screenshots.")).toBeTruthy(),
    );
  });
});

describe("deleteReportScreenshotAction", () => {
  it("refuses anyone the captain gate refuses, and deletes nothing", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Only captains can delete a report's screenshot.",
    });
    expect(await deleteReportScreenshotAction(ROW.id)).toEqual({
      ok: false,
      error: "Only captains can delete a report's screenshot.",
    });
    expect(captainActionGate).toHaveBeenCalledWith(
      "captain",
      expect.any(String),
    );
    expect(removeReportScreenshot).not.toHaveBeenCalled();
  });
});
