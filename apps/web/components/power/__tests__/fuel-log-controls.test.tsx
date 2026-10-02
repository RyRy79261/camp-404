import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// CodeRabbit (#329): CountCansButton is keyed by the cans' own versions
// (fuel-log/page.tsx: `key={cans.map((c) => c.version).join(",")}`). When
// counting two or more cans, a can earlier in the loop can save (its
// version moves on) before a later one fails; the refresh that follows
// changes the key and remounts the dialog, dropping the inline `error`
// state with it, so the user sees no failure at all even though some of
// what they typed was never saved. A toast survives the remount.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/app/(console)/power/fuel-log/actions", () => ({
  updateFuelCanAction: vi.fn(),
}));

import { toast } from "@camp404/ui/components/toast";
import { updateFuelCanAction } from "@/app/(console)/power/fuel-log/actions";
import { CountCansButton, type EditableCan } from "../fuel-log-controls";

afterEach(cleanup);

function cans(): EditableCan[] {
  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      version: 1,
      label: "Can 1",
      capacityLitres: 20,
      litres: 5,
      location: "storage",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      version: 1,
      label: "Can 2",
      capacityLitres: 20,
      litres: 5,
      location: "storage",
    },
  ];
}

describe("CountCansButton", () => {
  it("toasts the failure of a second can when the first already saved", async () => {
    vi.mocked(updateFuelCanAction)
      .mockResolvedValueOnce({ ok: true, version: 2 } as never)
      .mockResolvedValueOnce({ ok: false, error: "Someone else changed it." } as never);

    render(<CountCansButton cans={cans()} />);
    fireEvent.click(screen.getByRole("button", { name: "Count the cans" }));
    fireEvent.change(screen.getByLabelText("Can 1"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Can 2"), {
      target: { value: "12" },
    });
    expect((screen.getByLabelText("Can 1") as HTMLInputElement).value).toBe(
      "10",
    );
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Can 2: Someone else changed it.",
      ),
    );
    expect(updateFuelCanAction).toHaveBeenCalledTimes(2);
    // The inline error, which a remount after the refresh would drop, says
    // the same thing while it is still on screen.
    expect(screen.getByRole("alert").textContent).toContain(
      "Can 2: Someone else changed it.",
    );
  });
});
