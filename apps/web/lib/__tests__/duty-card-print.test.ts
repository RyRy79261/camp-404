import { describe, expect, it } from "vitest";
import { dutyCardFooter, screenPageLabels } from "../duty-card-print";

describe("screenPageLabels", () => {
  it("counts each card's sheets through the whole print", () => {
    expect(screenPageLabels([100], 273)).toEqual(["page 1 of 1"]);
    expect(screenPageLabels([100, 400, 273], 273)).toEqual([
      "page 1 of 4",
      "pages 2–3 of 4",
      "page 4 of 4",
    ]);
  });

  it("gives an empty or unmeasured card one sheet", () => {
    expect(screenPageLabels([0, 0], 273)).toEqual([
      "page 1 of 2",
      "page 2 of 2",
    ]);
    expect(screenPageLabels([500], 0)).toEqual(["page 1 of 1"]);
  });
});

describe("dutyCardFooter", () => {
  it("names the published version and its day, or says a draft is not published", () => {
    expect(dutyCardFooter({ version: 4, published: "12 Apr 2027" })).toBe(
      "Survival Guide · version 4 · updated 12 Apr 2027",
    );
    expect(dutyCardFooter({ draftSaved: "3 Oct 2026" })).toBe(
      "Survival Guide · draft, not published · saved 3 Oct 2026",
    );
  });
});
