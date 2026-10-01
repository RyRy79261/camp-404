import { describe, expect, it } from "vitest";
import { printedOnText, quantityText } from "../rental-view";

// Small words the gear rental screens and sheets share (#241).

describe("quantityText", () => {
  it("always says how many, so one and two read alike", () => {
    expect(quantityText(1, "Sleeping bag")).toBe("1 × Sleeping bag");
    expect(quantityText(2, "Pillow")).toBe("2 × Pillow");
  });
});

describe("printedOnText", () => {
  it("names the burn year and the day, in the camp's time", () => {
    // 23:30 UTC on 30 September is already 1 October in South Africa.
    expect(printedOnText(2026, new Date("2026-09-30T23:30:00Z"))).toBe(
      "Burn 2026 · printed 1 October 2026",
    );
  });

  it("prints only the day when the camp has no year yet", () => {
    expect(printedOnText(1, new Date("2026-10-01T08:00:00Z"))).toBe(
      "Printed 1 October 2026",
    );
  });
});
