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
  participation: "applied" | "accepted" | "not_attending" | null,
  participationIntent: "yes" | "maybe" | "no" | null = participation
    ? participation === "not_attending"
      ? "no"
      : "yes"
    : null,
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
    member("m3", "Nadia No", "not_attending"),
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
      ["m3", { ticketStatus: "unknown", ddt: "none", wap: "issued" }],
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
    // A captain may set the member's ticket for someone who says Coming.
    expect(
      (
        within(t).getByRole("combobox", {
          name: "Ticket for Ben Placed",
        }) as HTMLSelectElement
      ).value,
    ).toBe("needs_directed_ticket");
    // One line under the heading says who sets what; the short names are
    // spelled out once, in the column heads' tooltips.
    expect(
      screen.getByText(
        "Says is the member's answer. Decision, ticket, DDT and WAP are set by captains.",
      ),
    ).toBeTruthy();
    expect(within(t).getByTitle("Direct distribution ticket")).toBeTruthy();
    expect(within(t).getByTitle("Work access pass")).toBeTruthy();
    const early = within(t).getByRole("combobox", {
      name: "WAP for Ben Placed",
    }) as HTMLSelectElement;
    expect(early.value).toBe("requested");
    // The decision is one control in the same place on every row, with the
    // captains' decision pressed.
    const adaAccept = within(t).getByRole("button", {
      name: "Accept Ada Yes for this year",
    });
    expect(adaAccept.getAttribute("aria-pressed")).toBe("false");
    expect(
      within(t)
        .getByRole("button", { name: "Accept Ben Placed for this year" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(t)
        .getByRole("button", { name: "Put Ben Placed on the waiting list" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    // A name opens the member on the roster.
    expect(
      within(t).getByRole("link", { name: "Ada Yes" }).getAttribute("href"),
    ).toBe("/captains/camp-management?member=m1");
    // The count line, and the ticket filter's count: one accepted member has
    // no ticket yet.
    expect(screen.getByRole("status").textContent).toBe(
      "3 members, 1 still needs a ticket",
    );
    const ticketFilter = screen.getByRole("combobox", {
      name: "Ticket",
    }) as HTMLSelectElement;
    expect([...ticketFilter.options].map((o) => o.textContent)).toContain(
      "Still needs a ticket (1)",
    );
  });

  it("gives a member who is not coming nothing to set or decide", async () => {
    gate("captain");
    render(await ApplicationsPage());

    const t = table();
    const nadia = within(t).getByText("Nadia No").closest("tr")!;
    expect(within(nadia).getByText("Not coming")).toBeTruthy();
    // Present first, then the absences.
    expect(
      within(nadia).getByText(
        "Nothing to decide until they say Coming or Maybe",
      ),
    ).toBeTruthy();
    expect(within(nadia).queryByRole("button")).toBeNull();
    expect(
      within(nadia).queryByRole("combobox", { name: /Ticket|DDT/ }),
    ).toBeNull();
    // A WAP the captains already gave her stays a select, so it can be taken
    // back.
    expect(
      (
        within(nadia).getByRole("combobox", {
          name: "WAP for Nadia No",
        }) as HTMLSelectElement
      ).value,
    ).toBe("issued");
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
    // Nobody decided on Nadia: a dash, not an empty cell.
    const nadia = within(t).getByText("Nadia No").closest("tr")!;
    expect(within(nadia).getByTitle("Nothing to decide")).toBeTruthy();
    expect(within(t).queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /for this year$/ })).toBeNull();
    expect(screen.getByRole("combobox", { name: "This year" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Ticket" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("3 members");
  });

  it("locks the page for a plain member, and reads nothing", async () => {
    gate("camp_member");
    render(await ApplicationsPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Applications" }),
    ).toBeTruthy();
    expect(screen.getByText("For captains and team leads")).toBeTruthy();
    expect(
      screen.getByText("Ask a captain if you need to know who is coming."),
    ).toBeTruthy();
    expect(getCampManagementRoster).not.toHaveBeenCalled();
    expect(listTicketsThisYear).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("filters to the members still needing a ticket", async () => {
    gate("captain");
    render(await ApplicationsPage());

    fireEvent.change(screen.getByRole("combobox", { name: "Ticket" }), {
      target: { value: "needs_ticket" },
    });
    const t = table();
    expect(within(t).getByText("Ben Placed")).toBeTruthy();
    expect(within(t).queryByText("Ada Yes")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "1 member, 1 still needs a ticket",
    );
  });

  it("finds a member by name", async () => {
    gate("captain");
    render(await ApplicationsPage());

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find a member by name" }),
      { target: { value: "ada" } },
    );
    const t = table();
    expect(within(t).getByText("Ada Yes")).toBeTruthy();
    expect(within(t).queryByText("Ben Placed")).toBeNull();
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

  it("does nothing when the decision already made is tapped again", async () => {
    gate("captain");
    render(await ApplicationsPage());

    fireEvent.click(
      within(table()).getByRole("button", {
        name: "Accept Ben Placed for this year",
      }),
    );
    expect(decideParticipationAction).not.toHaveBeenCalled();
  });
});
