import { describe, expect, it } from "vitest";
import {
  REPORT_SCREENSHOT_MAX_BYTES,
  REPORT_SCREENSHOT_TYPES,
} from "@camp404/db/report-screenshots";
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TYPES,
  VERCEL_BODY_MAX_BYTES,
} from "@/lib/report-screenshot-copy";

// The dialog and the upload route check a screenshot against
// lib/report-screenshot-copy.ts; the table's CHECKs say the same in
// @camp404/db. The app's limit is at most the table's, so the screen never
// accepts what the database refuses, and leaves room under Vercel's request
// limit for the form around the picture (audit 2 perf-deploy-2).
describe("report screenshot limits", () => {
  it("agree between the app and the table", () => {
    expect(SCREENSHOT_MAX_BYTES).toBeLessThanOrEqual(
      REPORT_SCREENSHOT_MAX_BYTES,
    );
    expect(Object.keys(SCREENSHOT_TYPES).sort()).toEqual(
      [...REPORT_SCREENSHOT_TYPES].sort(),
    );
  });

  it("fits a picture at the limit, and its form, under Vercel's request limit", () => {
    // A multipart form adds a few hundred bytes; 256 KB is ample room.
    expect(SCREENSHOT_MAX_BYTES + 256 * 1024).toBeLessThanOrEqual(
      VERCEL_BODY_MAX_BYTES,
    );
  });
});
