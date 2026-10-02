// What the report dialog and the upload route agree on for a bug report's
// screenshot (#313). A plain module: the dialog (client) and the route
// (server) both import it. @camp404/db/report-screenshots holds the same
// numbers for the table's CHECKs; lib/__tests__/report-screenshots.test.ts
// keeps the two equal.

/** The picture types a report may carry, and their file extensions. */
export const SCREENSHOT_TYPES: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** The largest picture kept: 5 MB. */
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

export const SCREENSHOT_WRONG_TYPE =
  "The screenshot must be a PNG, JPG or WebP picture.";
export const SCREENSHOT_TOO_BIG =
  "That picture is over 5 MB. Take a smaller screenshot, or crop it.";

/** The line the public issue carries instead of the picture. */
export const SCREENSHOT_ISSUE_LINE =
  "A screenshot is kept privately in Camp 404. Only captains can see it.";
