import { describe, expect, it } from "vitest";
import { refillText } from "../power-summary";

// CodeRabbit (#329): the "every N days" branch rounded 1/rate to a whole
// number, so a rate between 2/3 and 0.75 (1/rate between 1.33 and 1.5)
// still took that branch and rounded down to "every 1 days" — wrong on its
// face, and the fuel page shows it to every reader. The cut-off moved to
// 2/3: any rate at or below it always rounds 1/rate to 2 days or more, and
// a rate above it now falls through to the existing "once a day" wording.

describe("refillText", () => {
  it("says 'once a day' at a rate of 0.7, never 'every 1 days'", () => {
    const text = refillText(0.7);
    expect(text).not.toContain("every 1 days");
    expect(text).toBe("Tank filled about once a day");
  });

  it("says 'every 2 days' right at the 2/3 cut-off", () => {
    expect(refillText(2 / 3)).toBe("Tank filled about every 2 days");
  });

  it("says 'once a day' once the rate passes the cut-off", () => {
    expect(refillText(0.75)).toBe("Tank filled about once a day");
  });

  it("says null for a rate of 0", () => {
    expect(refillText(0)).toBeNull();
  });
});
