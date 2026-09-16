import { describe, expect, it } from "vitest";
import { humanDuration } from "../duration";

describe("humanDuration", () => {
  it("rounds up to a whole unit, so the wait is never shorter than said", () => {
    expect(humanDuration(0)).toBe("less than a minute");
    expect(humanDuration(59)).toBe("less than a minute");
    expect(humanDuration(60)).toBe("1 minute");
    expect(humanDuration(61)).toBe("2 minutes");
    expect(humanDuration(599)).toBe("10 minutes");
    expect(humanDuration(3_600)).toBe("1 hour");
    expect(humanDuration(3_601)).toBe("2 hours");
    expect(humanDuration(86_400)).toBe("1 day");
    expect(humanDuration(90_000)).toBe("2 days");
  });
});
