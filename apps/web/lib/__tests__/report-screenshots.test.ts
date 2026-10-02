import { describe, expect, it } from "vitest";
import {
  REPORT_SCREENSHOT_MAX_BYTES,
  REPORT_SCREENSHOT_TYPES,
} from "@camp404/db/report-screenshots";
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TYPES,
} from "@/lib/report-screenshot-copy";

// The dialog and the upload route check a screenshot against
// lib/report-screenshot-copy.ts; the table's CHECKs say the same in
// @camp404/db. Two copies, kept equal here, so the screen never accepts what
// the database refuses.
describe("report screenshot limits", () => {
  it("agree between the app and the table", () => {
    expect(SCREENSHOT_MAX_BYTES).toBe(REPORT_SCREENSHOT_MAX_BYTES);
    expect(Object.keys(SCREENSHOT_TYPES).sort()).toEqual(
      [...REPORT_SCREENSHOT_TYPES].sort(),
    );
  });
});
