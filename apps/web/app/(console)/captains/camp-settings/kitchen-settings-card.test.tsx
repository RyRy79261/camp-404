import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// The Kitchen card: it shows the saved values, saves whole numbers (an empty
// pot, burner or meal count is "not known"), and puts a problem beside the
// field it belongs to. A refusal from the server shows in the card, not as a
// toast. The daily cap on Claude runs is a silent server-side guard: the card
// neither shows it nor sends it, so a save keeps the stored one.

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
  recipeProofreadDailyCap: 5,
  kitchenLargestPotLitres: 50,
  kitchenBurnerCount: null,
  kitchenPlatesBreakfast: 60,
  kitchenPlatesLunch: null,
  kitchenPlatesDinner: 45,
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

  it("shows the saved values, with an unknown count left empty", () => {
    render(<KitchenSettingsCard settings={SAVED} />);
    expect(field("Largest pot (litres)").value).toBe("50");
    expect(field("Number of burners").value).toBe("");
    const meals = screen.getByRole("group", { name: "Plates per meal" });
    expect(meals.textContent).toMatch(
      /Mornings may have more plates than evenings\./,
    );
    expect(field("Breakfast").value).toBe("60");
    expect(field("Lunch").value).toBe("");
    expect(field("Dinner").value).toBe("45");
  });

  it("saves the plates per meal, each optional", async () => {
    render(<KitchenSettingsCard settings={SAVED} />);
    fireEvent.change(field("Breakfast"), { target: { value: "" } });
    fireEvent.change(field("Lunch"), { target: { value: "40" } });
    fireEvent.change(field("Dinner"), { target: { value: " 50 " } });
    save();
    await waitFor(() =>
      expect(setKitchenSettingsAction).toHaveBeenCalledWith({
        kitchenLargestPotLitres: 50,
        kitchenBurnerCount: null,
        kitchenPlatesBreakfast: null,
        kitchenPlatesLunch: 40,
        kitchenPlatesDinner: 50,
      }),
    );
    await waitFor(() => expect(field("Lunch").value).toBe("40"));
  });

  it("puts a wrong plate count beside its own meal, and sends nothing", async () => {
    render(<KitchenSettingsCard settings={SAVED} />);
    fireEvent.change(field("Breakfast"), { target: { value: "0" } });
    fireEvent.change(field("Lunch"), { target: { value: "501" } });
    fireEvent.change(field("Dinner"), { target: { value: "4.5" } });
    save();
    expect(await screen.findByText("Cook for at least 1 plate.")).toBeTruthy();
    expect(screen.getByText("Cook for at most 500 plates.")).toBeTruthy();
    expect(screen.getByText("Use a whole number.")).toBeTruthy();
    for (const meal of ["Breakfast", "Lunch", "Dinner"]) {
      expect(field(meal).getAttribute("aria-invalid")).toBe("true");
    }
    expect(field("Breakfast").getAttribute("aria-describedby")).toBe(
      screen.getByText("Cook for at least 1 plate.").id,
    );
    expect(setKitchenSettingsAction).not.toHaveBeenCalled();
  });

  it("has no runs-per-day field and sends no cap, so the stored one is kept", async () => {
    render(<KitchenSettingsCard settings={SAVED} />);
    // Something present first: the card has rendered its fields.
    expect(field("Largest pot (litres)")).toBeTruthy();
    expect(screen.queryByText(/runs? (left|per day)|per day/i)).toBeNull();
    expect(screen.queryByLabelText(/runs/i)).toBeNull();
    save();
    await waitFor(() => expect(setKitchenSettingsAction).toHaveBeenCalled());
    const sent = vi.mocked(setKitchenSettingsAction).mock.calls[0]![0];
    expect(sent).not.toHaveProperty("recipeProofreadDailyCap");
  });

  it("saves whole numbers, and an empty field as not known, keeping the plates per meal", async () => {
    render(<KitchenSettingsCard settings={SAVED} />);
    fireEvent.change(field("Largest pot (litres)"), { target: { value: "" } });
    fireEvent.change(field("Number of burners"), { target: { value: " 4 " } });
    save();
    await waitFor(() =>
      expect(setKitchenSettingsAction).toHaveBeenCalledWith({
        kitchenLargestPotLitres: null,
        kitchenBurnerCount: 4,
        kitchenPlatesBreakfast: 60,
        kitchenPlatesLunch: null,
        kitchenPlatesDinner: 45,
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
