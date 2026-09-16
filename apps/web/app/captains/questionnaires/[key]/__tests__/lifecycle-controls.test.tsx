import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../actions", () => ({
  closeActivationAction: vi.fn(),
  getCarryOverAction: vi.fn(),
  publishAction: vi.fn(),
  setCarryOverAction: vi.fn(),
  unpublishAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { LifecycleBar } from "../lifecycle-controls";
import { getCarryOverAction, setCarryOverAction } from "../../actions";

// The per-questionnaire year policy. The switch is phrased the way a captain
// thinks about it ("ask everyone again next year") and is therefore the
// INVERSE of the stored `carry_over` column — these tests pin that inversion,
// because getting it backwards would silently re-ask the whole camp.

function renderBar() {
  return render(
    <LifecycleBar
      questionnaireKey="arrival"
      status="draft"
      version={null}
      openActivationId={null}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LifecycleBar — ask again next year", () => {
  it("holds the switch disabled until the current setting has loaded", async () => {
    let resolve: (value: { ok: true; carryOver: boolean }) => void = () => {};
    vi.mocked(getCarryOverAction).mockReturnValue(
      new Promise((r) => {
        resolve = r as never;
      }) as never,
    );
    renderBar();

    const control = screen.getByRole("switch", {
      name: "Ask everyone again next year",
    });
    expect(control.getAttribute("data-disabled")).not.toBeNull();
    expect(screen.getByText(/Checking this questionnaire/)).toBeTruthy();

    resolve({ ok: true, carryOver: true });
    await waitFor(() =>
      expect(screen.getByText(/nothing happens to this/i)).toBeTruthy(),
    );
  });

  it("renders a carry-over questionnaire as OFF, with the reassuring copy", async () => {
    vi.mocked(getCarryOverAction).mockResolvedValue({
      ok: true,
      carryOver: true,
    });
    renderBar();

    await waitFor(() =>
      expect(
        screen
          .getByRole("switch", { name: "Ask everyone again next year" })
          .getAttribute("aria-checked"),
      ).toBe("false"),
    );
    expect(
      screen.getByText(/Anyone who has answered stays answered/),
    ).toBeTruthy();
  });

  it("renders a fresh questionnaire as ON, and says the form starts blank", async () => {
    vi.mocked(getCarryOverAction).mockResolvedValue({
      ok: true,
      carryOver: false,
    });
    renderBar();

    await waitFor(() =>
      expect(
        screen
          .getByRole("switch", { name: "Ask everyone again next year" })
          .getAttribute("aria-checked"),
      ).toBe("true"),
    );
    expect(screen.getByText(/goes out again on a blank form/)).toBeTruthy();
  });

  it("switching ON writes carryOver: false — the inversion, end to end", async () => {
    vi.mocked(getCarryOverAction).mockResolvedValue({
      ok: true,
      carryOver: true,
    });
    vi.mocked(setCarryOverAction).mockResolvedValue({ ok: true });
    renderBar();

    const control = screen.getByRole("switch", {
      name: "Ask everyone again next year",
    });
    await waitFor(() =>
      expect(control.getAttribute("data-disabled")).toBeNull(),
    );
    fireEvent.click(control);

    await waitFor(() =>
      expect(setCarryOverAction).toHaveBeenCalledWith("arrival", false),
    );
    await waitFor(() =>
      expect(control.getAttribute("aria-checked")).toBe("true"),
    );
  });

  it("leaves the switch where it was when the write is refused", async () => {
    vi.mocked(getCarryOverAction).mockResolvedValue({
      ok: true,
      carryOver: true,
    });
    vi.mocked(setCarryOverAction).mockResolvedValue({
      ok: false,
      error: "Only captains can publish or send.",
    });
    renderBar();

    const control = screen.getByRole("switch", {
      name: "Ask everyone again next year",
    });
    await waitFor(() =>
      expect(control.getAttribute("data-disabled")).toBeNull(),
    );
    fireEvent.click(control);

    await waitFor(() => expect(setCarryOverAction).toHaveBeenCalled());
    expect(control.getAttribute("aria-checked")).toBe("false");
  });

  it("keeps the switch out of reach when the read is refused", async () => {
    vi.mocked(getCarryOverAction).mockResolvedValue({
      ok: false,
      error: "Only captains can publish or send.",
    });
    renderBar();

    await waitFor(() => expect(getCarryOverAction).toHaveBeenCalled());
    const control = screen.getByRole("switch", {
      name: "Ask everyone again next year",
    });
    expect(control.getAttribute("data-disabled")).not.toBeNull();
    expect(setCarryOverAction).not.toHaveBeenCalled();
  });
});
