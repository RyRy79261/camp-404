import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// The Kitchen card: it shows the saved pot and burners, saves whole numbers
// (an empty one is "not known"), and puts a problem beside the field it
// belongs to. A refusal from the server shows in the card, not as a toast.
// The plates at each meal are the meal plan's, and there is no daily cap:
// the card neither shows nor sends either.

vi.mock("../../kitchen/recipes/actions", () => ({
  setKitchenSettingsAction: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { setKitchenSettingsAction } from "../../kitchen/recipes/actions";
import { KitchenSettingsCard } from "./kitchen-settings-card";

const SAVED = {
  kitchenLargestPotLitres: 50,
  kitchenBurnerCount: null,
};

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const save = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Save kitchen settings" }),
  );

describe("KitchenSettingsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(setKitchenSettingsAction).mockImplementation(async (input) => ({
      ok: true,
      data: { settings: input as typeof SAVED },
    }));
  });

  it("shows the saved values, with an unknown count left empty, and no plates per meal", () => {
    render(<KitchenSettingsCard settings={SAVED} />);
    expect(field("Largest pot (litres)").value).toBe("50");
    expect(field("Number of burners").value).toBe("");
    expect(
      screen.getByText(/The plates at each meal are on the Kitchen/),
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Plates per meal" })).toBeNull();
    for (const meal of ["Breakfast", "Lunch", "Dinner"]) {
      expect(screen.queryByLabelText(meal)).toBeNull();
    }
  });

  it("has no runs-per-day field and sends only the pot and the burners", async () => {
    render(<KitchenSettingsCard settings={SAVED} />);
    // Something present first: the card has rendered its fields.
    expect(field("Largest pot (litres)")).toBeTruthy();
    expect(screen.queryByText(/runs? (left|per day)|per day/i)).toBeNull();
    expect(screen.queryByLabelText(/runs/i)).toBeNull();
    save();
    await waitFor(() => expect(setKitchenSettingsAction).toHaveBeenCalled());
    expect(vi.mocked(setKitchenSettingsAction).mock.calls[0]![0]).toEqual({
      kitchenLargestPotLitres: 50,
      kitchenBurnerCount: null,
    });
  });

  it("saves whole numbers, and an empty field as not known", async () => {
    render(<KitchenSettingsCard settings={SAVED} />);
    fireEvent.change(field("Largest pot (litres)"), { target: { value: "" } });
    fireEvent.change(field("Number of burners"), { target: { value: " 4 " } });
    save();
    await waitFor(() =>
      expect(setKitchenSettingsAction).toHaveBeenCalledWith({
        kitchenLargestPotLitres: null,
        kitchenBurnerCount: 4,
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Kitchen settings saved");
  });

  it("puts each problem beside its own field, and sends nothing", async () => {
    render(<KitchenSettingsCard settings={SAVED} />);
    fireEvent.change(field("Largest pot (litres)"), {
      target: { value: "2.5" },
    });
    fireEvent.change(field("Number of burners"), { target: { value: "99" } });
    save();

    expect(await screen.findByText("Use a whole number.")).toBeTruthy();
    expect(field("Largest pot (litres)").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(screen.getByText("Count at most 20 burners.")).toBeTruthy();
    expect(setKitchenSettingsAction).not.toHaveBeenCalled();
  });

  it("uses the shared limits for a number that is out of range", async () => {
    render(<KitchenSettingsCard settings={SAVED} />);
    fireEvent.change(field("Number of burners"), { target: { value: "99" } });
    save();
    expect(await screen.findByText("Count at most 20 burners.")).toBeTruthy();
    expect(field("Number of burners").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(setKitchenSettingsAction).not.toHaveBeenCalled();
  });

  it("shows a refusal from the server in the card", async () => {
    vi.mocked(setKitchenSettingsAction).mockResolvedValue({
      ok: false,
      error: "Only a captain can change the kitchen settings.",
    });
    render(<KitchenSettingsCard settings={SAVED} />);
    save();
    expect(
      await screen.findByText(
        "Only a captain can change the kitchen settings.",
      ),
    ).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
