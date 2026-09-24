import { describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ParticipationStatus } from "@camp404/types";

vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { RosterList } from "./roster-list";
import { RosterTable, type DecideThisYear } from "./roster-table";
import { toPublicRosterRow, type RosterDisplayRow } from "@/lib/camp-roster";
import type { CampManagementMember } from "@camp404/db/roster";

// A pending, onboarding-incomplete member — every approval signal "on" — so the
// projection→render seam test proves the PUBLIC row still renders none of it.
function pendingMember(): CampManagementMember {
  return {
    id: "m1",
    displayName: "Nova Reyes",
    handle: "nova",
    rank: "member",
    approvalStatus: "pending",
    isLead: false,
    teams: [],
    duesPaid: false,
    membershipTier: null,
    onboardingComplete: false,
    pendingRequiredActions: 3,
    pendingRequiredActionItems: [],
    intendsToDrive: false,
    driverProfileComplete: false,
    country: "ZA",
    participation: null,
    createdAt: new Date("2026-01-01"),
  };
}

const memberRow: RosterDisplayRow = {
  id: "m1",
  displayName: "Nova Reyes",
  handle: "nova",
  rankLabel: "Member",
  rank: "member",
  isLead: false,
  teams: [],
  country: "South Africa",
  inSouthAfrica: true,
  standing: null,
  // no `status` → member projection (no captain triage signal)
};

// A member-view row for somebody still waiting on a captain's decision.
const applicantRow: RosterDisplayRow = { ...memberRow, standing: "pending" };

const captainRow: RosterDisplayRow = {
  ...memberRow,
  status: "awaiting_approval",
  statusLabel: "Awaiting approval",
};

describe("RosterTable", () => {
  it("opens a row through a real (keyboard-reachable) button", () => {
    const onSelect = vi.fn();
    render(
      <RosterTable rows={[memberRow]} selectedId={null} onSelect={onSelect} />,
    );
    const open = screen.getByRole("button", {
      name: "Open Nova Reyes's profile",
    });
    expect(open.tagName).toBe("BUTTON");
    fireEvent.click(open);
    expect(onSelect).toHaveBeenCalledWith("m1");
  });

  it("marks the selected row's control with aria-current", () => {
    render(
      <RosterTable rows={[memberRow]} selectedId="m1" onSelect={() => {}} />,
    );
    expect(
      screen
        .getByRole("button", { name: "Open Nova Reyes's profile" })
        .getAttribute("aria-current"),
    ).toBe("true");
  });

  it("shows no approval-status label for a member row", () => {
    render(
      <RosterTable rows={[memberRow]} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.queryByText("Awaiting approval")).toBeNull();
  });

  it("exposes the status label (sr-only) for a captain row", () => {
    render(
      <RosterTable rows={[captainRow]} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByText("Awaiting approval")).toBeTruthy();
  });

  it("renders NO captain triage signal for a row produced by toPublicRosterRow (projection→render seam)", () => {
    render(
      <RosterTable
        rows={[toPublicRosterRow(pendingMember())]}
        selectedId={null}
        onSelect={() => {}}
        showStanding
      />,
    );
    // Present first: the one standing a member may read.
    expect(screen.getByText("Pending")).toBeTruthy();
    // Then the absences — none of the captain's triage vocabulary.
    for (const label of [
      "Awaiting approval",
      "Onboarding",
      "Action needed",
      "Declined",
      "Ready",
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("draws the Standing column only when the island asks for it", () => {
    const { unmount } = render(
      <RosterTable
        rows={[applicantRow]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Member" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Standing" })).toBeNull();
    expect(screen.queryByText("Pending")).toBeNull();
    unmount();

    render(
      <RosterTable
        rows={[applicantRow]}
        selectedId={null}
        onSelect={() => {}}
        showStanding
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Standing" })).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("never draws a standing beside a captain's status column", () => {
    render(
      <RosterTable
        rows={[{ ...captainRow, standing: "pending" }]}
        selectedId={null}
        onSelect={() => {}}
        showStanding
      />,
    );
    // One column, one badge: the captain's, which already says as much.
    expect(screen.getByText("Awaiting approval")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Standing" })).toBeNull();
    expect(screen.queryByText("Pending")).toBeNull();
  });
});

describe("RosterTable — sortable headers", () => {
  it("marks the sorted column and flips direction on a second press", () => {
    const onChange = vi.fn();
    render(
      <RosterTable
        rows={[memberRow]}
        selectedId={null}
        onSelect={() => {}}
        sort={{ value: { key: "name", direction: "asc" }, onChange }}
      />,
    );
    const member = screen.getByRole("columnheader", { name: /Member/ });
    expect(member.getAttribute("aria-sort")).toBe("ascending");
    expect(
      screen
        .getByRole("columnheader", { name: /Country/ })
        .getAttribute("aria-sort"),
    ).toBe("none");

    fireEvent.click(screen.getByRole("button", { name: /Member/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      key: "name",
      direction: "desc",
    });
    fireEvent.click(screen.getByRole("button", { name: /Country/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      key: "country",
      direction: "asc",
    });
  });

  it("renders plain headers for the member roster", () => {
    render(
      <RosterTable rows={[memberRow]} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /^Member/ })).toBeNull();
  });
});

describe("RosterTable — This year", () => {
  const withYear = (
    thisYear: ParticipationStatus | null,
    over: Partial<RosterDisplayRow> = {},
  ): RosterDisplayRow => ({ ...captainRow, thisYear, ...over });

  it("draws the column only when the rows carry the key", () => {
    const { unmount } = render(
      <RosterTable rows={[memberRow]} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByRole("columnheader", { name: "Member" })).toBeTruthy();
    expect(
      screen.queryByRole("columnheader", { name: "This year" }),
    ).toBeNull();
    unmount();

    // A lead's public row: the key, no captain status.
    render(
      <RosterTable
        rows={[{ ...memberRow, thisYear: "applied" }]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(
      screen.getByRole("columnheader", { name: "This year" }),
    ).toBeTruthy();
    expect(screen.getByText("Coming")).toBeTruthy();
    // No decision callback: read-only, whatever the status.
    expect(screen.queryByRole("button", { name: /^Accept / })).toBeNull();
  });

  it("says Not answered for a member with no answer", () => {
    render(
      <RosterTable
        rows={[withYear(null)]}
        selectedId={null}
        onSelect={() => {}}
        onDecideThisYear={vi.fn()}
      />,
    );
    expect(screen.getByText("Not answered")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Accept / })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /on the waiting list$/ }),
    ).toBeNull();
  });

  it.each<[ParticipationStatus, boolean, boolean]>([
    ["applied", true, true],
    ["maybe", true, true],
    ["waitlisted", true, false],
    ["accepted", false, true],
    ["not_attending", false, false],
  ])(
    "offers the right buttons for %s (Accept %s, Waiting list %s)",
    (status, accept, waitlist) => {
      render(
        <RosterTable
          rows={[withYear(status)]}
          selectedId={null}
          onSelect={() => {}}
          onDecideThisYear={vi.fn()}
        />,
      );
      expect(
        screen.queryByRole("button", {
          name: "Accept Nova Reyes for this year",
        }) !== null,
      ).toBe(accept);
      expect(
        screen.queryByRole("button", {
          name: "Put Nova Reyes on the waiting list",
        }) !== null,
      ).toBe(waitlist);
    },
  );

  it("decides without opening the row", async () => {
    const onSelect = vi.fn();
    const decide = vi.fn<DecideThisYear>(async () => ({ ok: true }));
    render(
      <RosterTable
        rows={[withYear("applied")]}
        selectedId={null}
        onSelect={onSelect}
        onDecideThisYear={decide}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Accept Nova Reyes for this year" }),
    );
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(decide.mock.calls[0]![1]).toBe("accepted");
    expect(onSelect).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts a failure, spinning only the tapped button meanwhile", async () => {
    vi.mocked(toast.error).mockClear();
    let settle!: (r: { ok: false; error: string }) => void;
    const decide = vi.fn<DecideThisYear>(
      () => new Promise((resolve) => (settle = resolve)),
    );
    const { container } = render(
      <RosterTable
        rows={[
          withYear("applied"),
          withYear("maybe", { id: "m2", displayName: "Kai Moss" }),
        ]}
        selectedId={null}
        onSelect={() => {}}
        onDecideThisYear={decide}
      />,
    );
    const tapped = screen.getByRole("button", {
      name: "Put Nova Reyes on the waiting list",
    });
    fireEvent.click(tapped);

    // Only the tapped button spins; its row's other button waits, and the
    // next row's buttons are untouched.
    await waitFor(() =>
      expect(tapped.querySelector(".animate-spin")).not.toBeNull(),
    );
    expect(container.querySelectorAll(".animate-spin")).toHaveLength(1);
    const accept = screen.getByRole("button", {
      name: "Accept Nova Reyes for this year",
    }) as HTMLButtonElement;
    expect(accept.querySelector(".animate-spin")).toBeNull();
    expect(accept.disabled).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Accept Kai Moss for this year",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    await act(async () =>
      settle({ ok: false, error: "Nova Reyes's answer changed." }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Nova Reyes's answer changed."),
    );
    expect(container.querySelectorAll(".animate-spin")).toHaveLength(0);
  });

  it("keeps keyboard focus on the row after a decision lands", async () => {
    const decide = vi.fn<DecideThisYear>(async () => ({ ok: true }));
    const { rerender } = render(
      <RosterTable
        rows={[withYear("applied")]}
        selectedId={null}
        onSelect={() => {}}
        onDecideThisYear={decide}
      />,
    );
    const accept = screen.getByRole("button", {
      name: "Accept Nova Reyes for this year",
    });
    accept.focus();
    fireEvent.click(accept);
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    // Working, the tapped button keeps focus (aria-disabled, not disabled).
    expect(document.activeElement).toBe(accept);
    await act(async () => {});

    // The refresh brings the row back accepted: Accept is no longer offered,
    // so focus moves to the row's remaining button, not to <body>.
    rerender(
      <RosterTable
        rows={[withYear("accepted")]}
        selectedId={null}
        onSelect={() => {}}
        onDecideThisYear={decide}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Accept Nova Reyes for this year" }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", {
        name: "Put Nova Reyes on the waiting list",
      }),
    );
  });

  it("leaves focus on the tapped button when the decision fails", async () => {
    vi.mocked(toast.error).mockClear();
    const decide = vi.fn<DecideThisYear>(async () => ({
      ok: false,
      error: "Nova Reyes's answer changed.",
    }));
    render(
      <RosterTable
        rows={[withYear("maybe")]}
        selectedId={null}
        onSelect={() => {}}
        onDecideThisYear={decide}
      />,
    );
    const waitlist = screen.getByRole("button", {
      name: "Put Nova Reyes on the waiting list",
    });
    waitlist.focus();
    fireEvent.click(waitlist);
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(waitlist);
  });

  it("puts the badge and the buttons on the phone card, outside its open button", () => {
    render(
      <RosterList
        rows={[withYear("maybe")]}
        selectedId={null}
        onSelect={() => {}}
        onDecideThisYear={vi.fn()}
      />,
    );
    const open = screen.getByRole("button", {
      name: "Open Nova Reyes's profile",
    });
    const accept = screen.getByRole("button", {
      name: "Accept Nova Reyes for this year",
    });
    expect(open.contains(accept)).toBe(false);
    expect(
      within(screen.getByRole("listitem")).getByText("Maybe"),
    ).toBeTruthy();
  });

  it("gives a plain member's phone card no This year line", () => {
    render(
      <RosterList rows={[memberRow]} selectedId={null} onSelect={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: "Open Nova Reyes's profile" }),
    ).toBeTruthy();
    expect(screen.queryByText("This year")).toBeNull();
  });
});
