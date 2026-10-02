import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The dietary pick-list (#245; the owner, 2026-10-02): a row per food with
// how it affects the member, then their diet; the old form's words shown on
// top to pick again, never converted; a refused save shown above the button.

vi.mock("./actions", () => ({ saveDietaryAction: vi.fn() }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { toast } from "@camp404/ui/components/toast";
import { saveDietaryAction } from "./actions";
import { DietaryForm } from "./dietary-form";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveDietaryAction).mockResolvedValue({ ok: true });
});

describe("DietaryForm", () => {
  it("shows the old form's words to pick again, and starts every food at No", () => {
    render(
      <DietaryForm
        mine={{
          foods: [],
          diets: [],
          savedAt: null,
          old: {
            allergies: "peanuts, sesame",
            isAnaphylactic: true,
            notes: "Keep my bowl apart",
          },
        }}
      />,
    );
    const old = screen.getByRole("region", { name: "What you wrote before" });
    expect(old.textContent).toContain("peanuts, sesame");
    expect(old.textContent).toContain("AnaphylacticYes");
    expect(old.textContent).toContain("Keep my bowl apart");
    const peanuts = screen.getByRole("group", { name: "Peanuts" });
    expect(
      within(peanuts)
        .getByRole("button", { name: "No" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("region", { name: "What you wrote before" })
        .closest("[data-os-private]"),
    ).toBeTruthy();
  });

  it("saves each food picked with how it affects them, and their diet", async () => {
    render(
      <DietaryForm
        mine={{
          foods: [{ food: "milk", reaction: "intolerance" }],
          diets: ["vegan"],
          savedAt: new Date(),
          old: null,
        }}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "What you wrote before" }),
    ).toBeNull();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Peanuts" })).getByRole(
        "button",
        {
          name: "Anaphylaxis",
        },
      ),
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Sesame" })).getByRole(
        "button",
        {
          name: "Allergy",
        },
      ),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Halal" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(saveDietaryAction).toHaveBeenCalledWith({
      foods: [
        { food: "milk", reaction: "intolerance" },
        { food: "peanuts", reaction: "anaphylaxis" },
        { food: "sesame", reaction: "allergy" },
      ],
      diets: ["vegan", "halal"],
    });
    expect(toast.success).toHaveBeenCalledWith("Dietary needs saved");
  });

  it("says why a save was refused", async () => {
    vi.mocked(saveDietaryAction).mockResolvedValue({
      ok: false,
      error: "Only a camp member can save dietary needs.",
    });
    render(
      <DietaryForm mine={{ foods: [], diets: [], savedAt: null, old: null }} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "Only a camp member can save dietary needs.",
    );
  });
});
