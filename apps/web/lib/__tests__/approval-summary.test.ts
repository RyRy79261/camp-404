import { describe, expect, it } from "vitest";
import { approvalSummary } from "../approval-summary";

describe("approvalSummary", () => {
  it("names who decided and when, in the camp's time zone", () => {
    expect(
      approvalSummary("approved", {
        byName: "Cap Tain",
        at: new Date("2026-09-16T22:30:00Z"),
      }),
    ).toBe("Approved by Cap Tain on 17 Sept 2026");
  });

  it("says only the decision when the decider is not known yet", () => {
    expect(approvalSummary("rejected")).toBe("Rejected");
    expect(approvalSummary("pending")).toBe("Awaiting a captain's decision");
  });
});
