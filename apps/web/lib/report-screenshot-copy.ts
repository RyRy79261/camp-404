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

/**
 * The largest picture the dialog sends and the upload route takes: 4 MB.
 * Vercel refuses a request body over 4.5 MB before the route sees it, with no
 * sentence the member can act on, so the picture and the form around it must
 * stay under that (audit 2 perf-deploy-2). A bigger picture is made smaller
 * in the browser first (SCREENSHOT_UPLOAD in lib/image.ts). The table's
 * CHECK (@camp404/db/report-screenshots) allows 5 MB: a ceiling above this.
 */
export const SCREENSHOT_MAX_BYTES = 4 * 1024 * 1024;

/** Vercel's limit on a request body: a function never sees a bigger one. */
export const VERCEL_BODY_MAX_BYTES = 4.5 * 1024 * 1024;

export const SCREENSHOT_WRONG_TYPE =
  "The screenshot must be a PNG, JPG or WebP picture.";
export const SCREENSHOT_TOO_BIG =
  "That picture is over 4 MB, even made smaller. Crop it, or send the report without it.";

/** The line the public issue carries instead of the picture. */
export const SCREENSHOT_ISSUE_LINE =
  "A screenshot is kept privately in Camp 404. Only captains can see it.";
