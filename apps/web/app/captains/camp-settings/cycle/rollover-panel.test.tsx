import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../actions", () => ({
  advanceCycleAction: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { RolloverPanel, type RolloverPlanView } from "./rollover-panel";
import { advanceCycleAction } from "../actions";

// The confirm screen is the safety mechanism, so these tests are about the
// three things that make it safe: the "nothing else changes" list is on screen,
// the button cannot fire until the new year's name has been typed back, and the
// dues lever only exists when there is something to clear.

const plan: RolloverPlanView = {
  from: {
    number: 1,
    label: "2026",
    startedAt: "1970-01-01T00:00:00.000Z",
    endedAt: null,
  },
  toNumber: 2,
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
      key: "dietary_requirements",
      title: "Dietary requirements",
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

function withDues(count: number): RolloverPlanView {
  return { ...plan, duesPaidCount: count };
}

function openConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Start a new year" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RolloverPanel — the plan", () => {
  it("shows every bucket, the member count, and the untouched list", () => {
    render(<RolloverPanel plan={plan} />);
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
  it("refuses to advance until the new year's name is typed back", () => {
    render(<RolloverPanel plan={plan} />);
    openConfirm();

    const advance = screen.getByRole("button", { name: /Start the new year/ });
    expect(advance).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Name the new year"), {
      target: { value: "2027" },
    });
    // Named, but not confirmed — still inert.
    expect(screen.getByRole("button", { name: "Start 2027" })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.change(screen.getByLabelText("Type 2027 again to confirm"), {
      target: { value: "2026" },
    });
    expect(screen.getByRole("button", { name: "Start 2027" })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.change(screen.getByLabelText("Type 2027 again to confirm"), {
      target: { value: "2027" },
    });
    expect(screen.getByRole("button", { name: "Start 2027" })).toHaveProperty(
      "disabled",
      false,
    );
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

  it("sends the label, and never a stray dues reset on a camp with none", async () => {
    vi.mocked(advanceCycleAction).mockResolvedValue({
      ok: true,
      report: {
        plan,
        to: {
          number: 2,
          label: "2027",
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
        duesCleared: [],
        announcementBroadcastId: null,
        auditLogId: "audit-9",
      },
    } as never);

    render(<RolloverPanel plan={plan} />);
    openConfirm();
    fireEvent.change(screen.getByLabelText("Name the new year"), {
      target: { value: "2027" },
    });
    fireEvent.change(screen.getByLabelText("Type 2027 again to confirm"), {
      target: { value: "2027" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start 2027" }));

    await waitFor(() =>
      expect(advanceCycleAction).toHaveBeenCalledWith({
        label: "2027",
        confirm: "2027",
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
    fireEvent.change(screen.getByLabelText("Name the new year"), {
      target: { value: "2027" },
    });
    fireEvent.change(screen.getByLabelText("Type 2027 again to confirm"), {
      target: { value: "2027" },
    });
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
        plan,
        to: {
          number: 2,
          label: "2027",
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
        duesCleared: ["u1", "u2"],
        announcementBroadcastId: "b-1",
        auditLogId: "audit-9",
      },
    } as never);

    render(<RolloverPanel plan={withDues(2)} />);
    openConfirm();
    fireEvent.change(screen.getByLabelText("Name the new year"), {
      target: { value: "2027" },
    });
    fireEvent.change(screen.getByLabelText("Type 2027 again to confirm"), {
      target: { value: "2027" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start 2027" }));

    await waitFor(() =>
      expect(screen.getByText("What just happened")).toBeTruthy(),
    );
    expect(screen.getByText(/asked again, 47 members/)).toBeTruthy();
    expect(screen.getByText(/Dues ticks cleared for 2 members/)).toBeTruthy();
    expect(
      screen.getByText("An announcement went out to everyone."),
    ).toBeTruthy();
    expect(screen.getByText("audit-9")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });
});
