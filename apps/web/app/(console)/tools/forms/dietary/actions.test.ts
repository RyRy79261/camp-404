import { beforeEach, describe, expect, it, vi } from "vitest";

// A member saves their own dietary needs (#245): as the signed-in member,
// never an id from the form; the shape is checked at the boundary.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/dietary", () => ({
  saveMyDietary: vi.fn(async () => ({ ok: true, savedAt: new Date() })),
}));

import { captainActionGate } from "@/lib/captain-gate";
import { saveMyDietary } from "@/lib/dietary";
import { saveDietaryAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    rank: "camp_member",
    campUser: { id: "member-1" },
  } as never);
});

describe("saveDietaryAction", () => {
  it("saves the member's own answers", async () => {
    const answers = {
      foods: [{ food: "peanuts", reaction: "anaphylaxis" }],
      diets: ["vegan"],
    };
    expect(
      await saveDietaryAction({ ...answers, userId: "someone-else" }),
    ).toEqual({
      ok: true,
    });
    expect(saveMyDietary).toHaveBeenCalledWith({
      userId: "member-1",
      ...answers,
    });
  });

  it("refuses an unknown food, and someone the gate refuses", async () => {
    expect(
      (
        await saveDietaryAction({
          foods: [{ food: "nuts", reaction: "allergy" }],
          diets: [],
        })
      ).ok,
    ).toBe(false);
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Not signed in.",
    });
    expect(await saveDietaryAction({ foods: [], diets: [] })).toEqual({
      ok: false,
      error: "Not signed in.",
    });
    expect(saveMyDietary).not.toHaveBeenCalled();
  });

  it("hands on the write's refusal", async () => {
    vi.mocked(saveMyDietary).mockResolvedValueOnce({ ok: false, error: "No." });
    expect(await saveDietaryAction({ foods: [], diets: [] })).toEqual({
      ok: false,
      error: "No.",
    });
  });
});
