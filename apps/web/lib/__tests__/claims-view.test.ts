import { describe, expect, it } from "vitest";
import { decisionLine, receiptLabel } from "../claims-view";

// What the Finance team reads about who decided a claim (#242). A claim
// stores one decider, the team's, so a turned-down claim names nobody: when
// the Finance team turns down a claim the team said yes to, the stored name
// is the lead who said yes, and naming them would blame the wrong person.

describe("decisionLine", () => {
  const claim = { approverName: "Kit Lead" };

  it("says who said yes, and that it was paid", () => {
    expect(decisionLine({ ...claim, status: "submitted" })).toBeNull();
    expect(decisionLine({ ...claim, status: "approved" })).toBe(
      "approved by Kit Lead",
    );
    expect(decisionLine({ ...claim, status: "paid" })).toBe(
      "approved by Kit Lead; paid",
    );
    expect(decisionLine({ ...claim, status: "reconciled" })).toBe(
      "approved by Kit Lead; paid",
    );
  });

  it("names nobody on a turned-down claim", () => {
    expect(decisionLine({ ...claim, status: "rejected" })).toBeNull();
  });

  it("says so when the decider has left the camp", () => {
    expect(decisionLine({ approverName: null, status: "approved" })).toBe(
      "approved by someone no longer in the camp",
    );
  });
});

describe("receiptLabel", () => {
  it("numbers each receipt and says what kind it is", () => {
    expect(receiptLabel(0, "application/pdf")).toBe("Receipt 1 (PDF)");
    expect(receiptLabel(1, "image/jpeg")).toBe("Receipt 2 (photo)");
  });
});
