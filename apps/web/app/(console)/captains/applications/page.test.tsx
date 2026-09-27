import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Applications page: the gate picks what is read and what is drawn. A
// captain reads the tickets and gets the controls; a team lead reads only the
// statuses (no ticket read at all, no controls); anyone else gets a lock and
// no read.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/roster", () => ({ getCampManagementRoster: vi.fn() }));
vi.mock("@/lib/tickets", () => ({ listTicketsThisYear: vi.fn() }));
vi.mock("./actions", () => ({ setTicketPassAction: vi.fn() }));
vi.mock("../camp-management/actions", () => ({
  decideParticipationAction: vi.fn(),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { captainPageGate } from "@/lib/captain-gate";
import { getCampManagementRoster } from "@/lib/roster";
import { listTicketsThisYear } from "@/lib/tickets";
import { decideParticipationAction } from "../camp-management/actions";
import { setTicketPassAction } from "./actions";
import ApplicationsPage from "./page";

function member(
  id: string,
  displayName: string,
  participation: "applied" | "accepted" | null,
  participationIntent: "yes" | "maybe" | null = participation ? "yes" : null,
) {
  return {
    id,
    displayName,
    approvalStatus: "approved",
    participation,
    participationIntent,
  };
}

function gate(rank: "captain" | "team_lead" | "camp_member") {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: rank !== "camp_member",
  } as never);
}

/** The desktop table (the phone list draws the same rows again). */
function table() {
  return screen.getByRole("table");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCampManagementRoster).mockResolvedValue([
    member("m1", "Ada Yes", "applied"),
    // Accepted, though he said Maybe: the page shows both, apart.
    member("m2", "Ben Placed", "accepted", "maybe"),
  ] as never);
  vi.mocked(listTicketsThisYear).mockResolvedValue(
    new Map([
      [
        "m2",
        {
          ticketStatus: "needs_directed_ticket",
          ddt: "none",
          wap: "requested",
        },
      ],
    ]),
  );
});
afterEach(cleanup);

describe("Applications page", () => {
  it("gives a captain the tickets, the passes and the decisions", async () => {
    gate("captain");
    render(await ApplicationsPage());

    expect(captainPageGate).toHaveBeenCalledWith("team_lead");
    expect(
      screen.getByRole("heading", { level: 1, name: "Applications" }),
    ).toBeTruthy();
    const t = table();
    expect(within(t).getByRole("columnheader", { name: "WAP" })).toBeTruthy();
    expect(within(t).getByText("Needs DDT")).toBeTruthy();
    // The two short names are spelled out once, with the decision rule.
    const hint = screen.getByText(/Decision is yours/);
    expect(hint.textContent).toMatch(/DDT \(direct distribution ticket\)/);
    expect(hint.textContent).toMatch(/WAP \(work access pass\)/);
    expect(hint.textContent).toMatch(/says Coming or Maybe/);
    const early = within(t).getByRole("combobox", {
      name: "WAP for Ben Placed",
    }) as HTMLSelectElement;
    expect(early.value).toBe("requested");
    expect(
      within(t).getByRole("button", { name: "Accept Ada Yes for this year" }),
    ).toBeTruthy();
    // The filter counts: one accepted member has no ticket yet.
    expect(
      screen.getByRole("button", { name: /Still need a ticket/ }).textContent,
    ).toBe("Still need a ticket1");
  });

  it("gives a team lead the statuses only, and never reads the tickets", async () => {
    gate("team_lead");
    render(await ApplicationsPage());

    // Present first, then the absences.
    const t = table();
    expect(within(t).getByText("Ada Yes")).toBeTruthy();
    expect(within(t).getByRole("columnheader", { name: "Says" })).toBeTruthy();
    expect(
      within(t).getByRole("columnheader", { name: "Decision" }),
    ).toBeTruthy();
    const ada = within(t).getByText("Ada Yes").closest("tr")!;
    expect(within(ada).getByText("Coming")).toBeTruthy();
    expect(within(ada).getByText("Not decided yet")).toBeTruthy();
    const ben = within(t).getByText("Ben Placed").closest("tr")!;
    expect(within(ben).getByText("Maybe")).toBeTruthy();
    expect(within(ben).getByText("Accepted")).toBeTruthy();
    expect(listTicketsThisYear).not.toHaveBeenCalled();
    expect(
      within(t).queryByRole("columnheader", { name: "Ticket" }),
    ).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /for this year$/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Still need a ticket/ }),
    ).toBeNull();
  });

  it("locks the page for a plain member, and reads nothing", async () => {
    gate("camp_member");
    render(await ApplicationsPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Applications" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Applications are for captains and team leads/),
    ).toBeTruthy();
    expect(getCampManagementRoster).not.toHaveBeenCalled();
    expect(listTicketsThisYear).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("filters to the members still needing a ticket", async () => {
    gate("captain");
    render(await ApplicationsPage());

    fireEvent.click(
      screen.getByRole("button", { name: /Still need a ticket/ }),
    );
    const t = table();
    expect(within(t).getByText("Ben Placed")).toBeTruthy();
    expect(within(t).queryByText("Ada Yes")).toBeNull();
  });

  it("saves a pass with the value the captain saw, and refreshes", async () => {
    gate("captain");
    vi.mocked(setTicketPassAction).mockResolvedValue({ ok: true });
    render(await ApplicationsPage());

    fireEvent.change(
      within(table()).getByRole("combobox", {
        name: "WAP for Ben Placed",
      }),
      { target: { value: "issued" } },
    );

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setTicketPassAction).toHaveBeenCalledWith({
      userId: "m2",
      pass: "wap",
      from: "requested",
      to: "issued",
    });
  });

  it("reports a failed save as a toast", async () => {
    gate("captain");
    vi.mocked(setTicketPassAction).mockResolvedValue({
      ok: false,
      error:
        "Ben Placed's ticket changed while you were looking. Refresh to see it.",
    });
    render(await ApplicationsPage());

    fireEvent.change(
      within(table()).getByRole("combobox", {
        name: "DDT for Ben Placed",
      }),
      { target: { value: "allocated" } },
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Ben Placed's ticket changed while you were looking. Refresh to see it.",
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("accepts a member with the status the captain saw", async () => {
    gate("captain");
    vi.mocked(decideParticipationAction).mockResolvedValue({ ok: true });
    render(await ApplicationsPage());

    fireEvent.click(
      within(table()).getByRole("button", {
        name: "Accept Ada Yes for this year",
      }),
    );

    await waitFor(() =>
      expect(decideParticipationAction).toHaveBeenCalledWith({
        userId: "m1",
        from: "applied",
        to: "accepted",
      }),
    );
  });
});
