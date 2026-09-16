import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../actions", () => ({
  advanceCycleAction: vi.fn(),
  setFoundingYearAction: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { RolloverPanel, type RolloverPlanView } from "./rollover-panel";
import { advanceCycleAction, setFoundingYearAction } from "../actions";

// Two screens behind one component, and the tests are about what makes each
// one safe. The first asks what year it is and refuses anything that isn't a
// plausible four-digit year, because that number is stamped on every row the
// camp already holds. The second is the rollover: the "nothing else changes"
// list is on screen, the button cannot fire until the new year's number has
// been typed back, a year that isn't later than the current one is refused,
// and the dues lever only exists when there is something to clear.

const plan: RolloverPlanView = {
  from: {
    year: 2026,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
  },
  suggestedYear: 2027,
  reGate: [
    {
      key: "arrival",
      title: "Arrival and departure",
      activationId: "act-1",
      recipientCount: 47,
      sendable: true,
    },
  ],
  carriesOver: [
    {
      key: "skills",
      title: "Skills",
      activationId: null,
      recipientCount: 0,
      sendable: true,
    },
  ],
  notSent: [
    {
      key: "driver_profile",
      title: "Driver profile",
      activationId: null,
      recipientCount: 0,
      sendable: false,
    },
  ],
  duesPaidCount: 0,
  untouched: [
    "Approvals — nobody returns to the approval queue.",
    "Answers — every previous year's answers stay readable. Nothing is deleted.",
  ],
};

/** The same camp, before anyone said what year it is. */
const unfounded: RolloverPlanView = {
  ...plan,
  from: null,
  suggestedYear: null,
};

function withDues(count: number): RolloverPlanView {
  return { ...plan, duesPaidCount: count };
}

function openConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Start a new year" }));
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const advanced = {
  ok: true,
  report: {
    plan,
    to: {
      year: 2027,
      startedAt: "2026-09-08T00:00:00.000Z",
      endedAt: null,
    },
    reGated: [
      {
        key: "arrival",
        title: "Arrival and departure",
        closedActivationId: "act-1",
        newActivationId: "act-2",
        gatesWritten: 47,
      },
    ],
    duesCleared: [] as string[],
    announcementBroadcastId: null as string | null,
    auditLogId: "audit-9",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RolloverPanel — naming the founding year", () => {
  it("asks the year rather than inventing one", () => {
    render(<RolloverPanel plan={unfounded} />);
    expect(screen.getByText("What year is it?")).toBeTruthy();
    // The rollover plan is not on screen — there is no year to roll over from.
    expect(screen.queryByText(/Will be asked again/)).toBeNull();
    expect(screen.queryByText(/You're in/)).toBeNull();
  });

  it("refuses anything that isn't a plausible four-digit year", () => {
    render(<RolloverPanel plan={unfounded} />);
    const button = () =>
      screen.getByRole("button", { name: /camp is in|Type the year/ });
    expect(button()).toHaveProperty("disabled", true);

    // Too short.
    type("This year", "202");
    expect(button()).toHaveProperty("disabled", true);

    // Not a year at all — the input strips everything but digits, so what is
    // left is still refused rather than coerced into something plausible.
    type("This year", "abcd");
    expect(screen.getByLabelText("This year")).toHaveProperty("value", "");

    // Outside the plausible range.
    type("This year", "1899");
    expect(button()).toHaveProperty("disabled", true);

    type("This year", "2026");
    expect(
      screen.getByRole("button", { name: "The camp is in 2026" }),
    ).toHaveProperty("disabled", false);
  });

  it("sends the year as a number and reports what it adopted", async () => {
    vi.mocked(setFoundingYearAction).mockResolvedValue({
      ok: true,
      report: {
        year: 2026,
        activationsStamped: 3,
        responsesStamped: 12,
        teamMembershipsStamped: 20,
        driverProfilesStamped: 1,
        carSeatsStamped: 0,
        auditLogId: "audit-1",
      },
    } as never);

    render(<RolloverPanel plan={unfounded} />);
    type("This year", "2026");
    fireEvent.click(
      screen.getByRole("button", { name: "The camp is in 2026" }),
    );

    await waitFor(() =>
      expect(setFoundingYearAction).toHaveBeenCalledWith({ year: 2026 }),
    );
    // The rows that predate the year namespace are now filed under it, and the
    // captain is told how many rather than left to assume. EVERY count the
    // transaction moved, not just the questionnaire ones — the roster facts are
    // the bulk of it on a camp that has been running. A zero count is left out
    // rather than printed.
    expect(
      await screen.findByText(
        /3 sends, 12 answers, 20 team places and 1 driver profile already on file are now filed under it/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/car seat/)).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces a refusal without pretending the camp has a year", async () => {
    vi.mocked(setFoundingYearAction).mockResolvedValue({
      ok: false,
      error: "The camp already has a year.",
    } as never);

    render(<RolloverPanel plan={unfounded} />);
    type("This year", "2026");
    fireEvent.click(
      screen.getByRole("button", { name: "The camp is in 2026" }),
    );

    await waitFor(() =>
      expect(screen.getByText("The camp already has a year.")).toBeTruthy(),
    );
    expect(screen.getByText("What year is it?")).toBeTruthy();
  });
});

describe("RolloverPanel — the plan", () => {
  it("shows every bucket, the member count, and the untouched list", () => {
    render(<RolloverPanel plan={plan} />);
    expect(screen.getByText(/You're in 2026/)).toBeTruthy();
    expect(screen.getByText("Will be asked again (1)")).toBeTruthy();
    expect(screen.getByText(/47 members/)).toBeTruthy();
    expect(screen.getByText("Will stay as they are (1)")).toBeTruthy();
    expect(screen.getByText("Not being asked right now (1)")).toBeTruthy();
    expect(screen.getByText("Nothing else changes")).toBeTruthy();
    expect(
      screen.getByText(/every previous year's answers stay readable/i),
    ).toBeTruthy();
  });

  it("tells the captain when a questionnaire cannot be sent at all", () => {
    render(<RolloverPanel plan={plan} />);
    expect(screen.getByText(/Built into the app/i)).toBeTruthy();
  });

  it("hides an empty bucket rather than rendering a zero", () => {
    render(<RolloverPanel plan={{ ...plan, reGate: [] }} />);
    expect(screen.queryByText(/Will be asked again/)).toBeNull();
  });
});

describe("RolloverPanel — the confirm step", () => {
  it("offers the next year but refuses to advance until it's typed back", () => {
    render(<RolloverPanel plan={plan} />);
    openConfirm();

    // Prefilled from the plan — offered, not decided.
    expect(screen.getByLabelText("The new year")).toHaveProperty(
      "value",
      "2027",
    );
    expect(screen.getByRole("button", { name: "Start 2027" })).toHaveProperty(
      "disabled",
      true,
    );

    type("Type 2027 again to confirm", "2026");
    expect(screen.getByRole("button", { name: "Start 2027" })).toHaveProperty(
      "disabled",
      true,
    );

    type("Type 2027 again to confirm", "2027");
    expect(screen.getByRole("button", { name: "Start 2027" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("takes a year the captain typed over the suggestion", () => {
    render(<RolloverPanel plan={plan} />);
    openConfirm();
    // A camp that skipped a burn goes straight to 2028.
    type("The new year", "2028");
    type("Type 2028 again to confirm", "2028");
    expect(screen.getByRole("button", { name: "Start 2028" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("refuses a year that isn't later than the one the camp is in", () => {
    render(<RolloverPanel plan={plan} />);
    openConfirm();
    type("The new year", "2025");

    expect(
      screen.getByText(/already in 2026\. A new year has to be later/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Start the new year/ }),
    ).toHaveProperty("disabled", true);
  });

  it("omits the dues lever when nobody holds a dues tick", () => {
    render(<RolloverPanel plan={plan} />);
    openConfirm();
    expect(screen.queryByText(/Clear the dues tick/)).toBeNull();
  });

  it("offers the dues lever, defaulted on, when someone does", () => {
    render(<RolloverPanel plan={withDues(12)} />);
    openConfirm();
    expect(screen.getByText(/Clear the dues tick for 12 members/)).toBeTruthy();
    expect(
      screen
        .getByRole("checkbox", { name: /Clear the dues tick/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("sends numbers, and never a stray dues reset on a camp with none", async () => {
    vi.mocked(advanceCycleAction).mockResolvedValue(advanced as never);

    render(<RolloverPanel plan={plan} />);
    openConfirm();
    type("Type 2027 again to confirm", "2027");
    fireEvent.click(screen.getByRole("button", { name: "Start 2027" }));

    await waitFor(() =>
      expect(advanceCycleAction).toHaveBeenCalledWith({
        year: 2027,
        confirm: 2027,
        resetDues: false,
        announcement: null,
      }),
    );
  });

  it("surfaces a refusal without pretending anything happened", async () => {
    vi.mocked(advanceCycleAction).mockResolvedValue({
      ok: false,
      error: "The camp has already started that year.",
    } as never);

    render(<RolloverPanel plan={plan} />);
    openConfirm();
    type("Type 2027 again to confirm", "2027");
    fireEvent.click(screen.getByRole("button", { name: "Start 2027" }));

    await waitFor(() =>
      expect(
        screen.getByText("The camp has already started that year."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("What just happened")).toBeNull();
  });
});

describe("RolloverPanel — the receipt", () => {
  it("names the new year, what was re-asked, and the receipt id", async () => {
    vi.mocked(advanceCycleAction).mockResolvedValue({
      ok: true,
      report: {
        ...advanced.report,
        duesCleared: ["u1", "u2"],
        announcementBroadcastId: "b-1",
      },
    } as never);

    render(<RolloverPanel plan={withDues(2)} />);
    openConfirm();
    type("Type 2027 again to confirm", "2027");
    fireEvent.click(screen.getByRole("button", { name: "Start 2027" }));

    await waitFor(() =>
      expect(screen.getByText("What just happened")).toBeTruthy(),
    );
    expect(
      screen.getByText(/2026 is closed\. 2027 is now the year/),
    ).toBeTruthy();
    expect(screen.getByText(/asked again, 47 members/)).toBeTruthy();
    expect(screen.getByText(/Dues ticks cleared for 2 members/)).toBeTruthy();
    expect(
      screen.getByText("An announcement went out to everyone."),
    ).toBeTruthy();
    expect(screen.getByText("audit-9")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });
});
