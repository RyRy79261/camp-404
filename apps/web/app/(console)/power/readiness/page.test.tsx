import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Readiness in the approved redesign (option B): the answer first ("3 of 9
// checks done on the Honda EU70is."), then the checks still to do above the
// done ones, the spare generator's list folded under them, and the team's
// work plan on the task board. Who and by when show only when they are set,
// never "Nobody yet · no due day" on every row. An editor ticks and edits; a
// reader sees a done mark and no control at all. The camp is the mock-up's
// own (tests/power-camp.ts).

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/test-mode", () => ({
  usesTestStore: () => true,
  isE2ETestMode: () => true,
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/app/(console)/power/readiness/actions");

import { captainPageGate } from "@/lib/captain-gate";
import { POWER_READ_ONLY } from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";
import { setUpPowerCamp, type PowerCamp } from "@/tests/power-camp";
import { renderServer } from "@/tests/render-server";
import PowerReadinessPage from "./page";

let camp: PowerCamp;

async function renderAs(
  who: keyof PowerCamp,
  rank: "camp_member" | "team_lead" | "captain",
  leads: string[] = [],
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: camp[who].id },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads as never);
  await renderServer(PowerReadinessPage());
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  camp = setUpPowerCamp();
});

describe("readiness", () => {
  it("opens on how many checks are done on the plan's generator", async () => {
    await renderAs("mem", "camp_member");
    const answer = screen.getByRole("region", { name: "The answer" });
    expect(answer.textContent).toContain(
      "3 of 9 checks done on the Honda EU70is.",
    );
    expect(within(answer).getByText("33%")).toBeTruthy();
  });

  it("puts the checks to do first, then the done ones", async () => {
    await renderAs("mem", "camp_member");
    const todo = screen.getByRole("list", { name: "To do" });
    const done = screen.getByRole("list", { name: "Done" });
    expect(within(todo).getAllByRole("listitem")).toHaveLength(6);
    expect(within(done).getAllByRole("listitem")).toHaveLength(3);
    expect(
      todo.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    for (const row of within(done).getAllByRole("listitem")) {
      expect(within(row).getByLabelText("Done")).toBeTruthy();
      expect(row.textContent).toContain("Pat Mokoena");
      expect(row.textContent).toMatch(/done \d+ \w{3}/);
    }
  });

  it("names who and when only where they are set", async () => {
    await renderAs("mem", "camp_member");
    const todo = screen.getByRole("list", { name: "To do" });
    const rows = within(todo).getAllByRole("listitem");
    const assigned = rows.filter((r) => r.textContent?.includes("Pat Mokoena"));
    expect(assigned).toHaveLength(2);
    expect(assigned.map((r) => r.textContent).join(" ")).toMatch(/by 15 Apr/);
    expect(screen.queryByText(/Nobody yet/)).toBeNull();
    expect(screen.queryByText(/no due day/)).toBeNull();
  });

  it("folds the spare generator's list under the plan's", async () => {
    await renderAs("mem", "camp_member");
    expect(
      screen.getByText("Kipor 10 (hired) · spare · not started"),
    ).toBeTruthy();
  });

  it("lists the work plan with a way to the task board", async () => {
    await renderAs("mem", "camp_member");
    const tasks = screen.getByRole("list", { name: "Work plan tasks" });
    expect(within(tasks).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(
      screen
        .getByRole("link", { name: "Open the task board" })
        .getAttribute("href"),
    ).toBe("/tasks");
  });

  it("gives a member and a Kitchen lead no tick and no button", async () => {
    await renderAs("mem", "camp_member");
    expect(screen.getByText(POWER_READ_ONLY)).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    cleanup();
    await renderAs("kim", "team_lead", ["kitchen"]);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("gives a Power & Lighting lead a tick and one Edit on every check", async () => {
    await renderAs("pat", "team_lead", ["power_and_lighting"]);
    expect(screen.getByRole("button", { name: "Add a check" })).toBeTruthy();
    const todo = screen.getByRole("list", { name: "To do" });
    for (const row of within(todo).getAllByRole("listitem")) {
      expect(within(row).getByRole("checkbox")).toBeTruthy();
      expect(
        within(row)
          .getAllByRole("button")
          .filter((b) => b.getAttribute("role") !== "checkbox")
          .map((b) => b.textContent),
      ).toEqual(["Edit"]);
    }
  });
});
