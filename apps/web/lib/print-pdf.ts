import "server-only";

import { redactSecrets } from "@camp404/core";
import type { Browser } from "playwright-core";
import { PRINT_SHEET_ATTR } from "./print";

// Makes the PDF of a print page (#249, the owner's ruling 2026-09-30: a real
// file, not the browser's print dialog). It opens the page in a headless
// Chromium with the member's own cookies, so the page's own permission gate
// decides what is drawn, and saves it with Chromium's print-to-PDF: the file
// is the print view, A4, with the same print styles as paper.
//
// Chromium: on Vercel, @sparticuz/chromium (a Chromium built for serverless
// Linux, unpacked into /tmp on the first call); anywhere else, the Chromium
// Playwright installs for the tests (`playwright install chromium`).

/**
 * What the PDF browser may never call. It opens the page with the member's
 * cookies and reports its tab as visible, so the notice gate there would
 * claim the member's pop-ups (marking them read, in a browser nobody sees)
 * and could cover the sheet. The gate stays quiet on print pages itself; this
 * is the second lock.
 */
export const PDF_BLOCKED_REQUESTS = "**/api/notifications/**";

/** How long the page may take to load and draw. */
const PAGE_TIMEOUT_MS = 20_000;

export type RenderResult =
  | { ok: true; pdf: Uint8Array }
  | { ok: false; reason: "refused" | "failed" };

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (process.env.VERCEL_ENV?.trim()) {
    const serverless = (await import("@sparticuz/chromium")).default;
    return chromium.launch({
      args: serverless.args,
      executablePath: await serverless.executablePath(),
      headless: true,
    });
  }
  return chromium.launch({ headless: true });
}

export async function renderPrintPdf(input: {
  /** This site's origin, already checked (mayRenderHost). */
  origin: string;
  /** The print page's path and query, already checked (printPagePath). */
  path: string;
  /** The member's cookies, to open the page as them. */
  cookies: { name: string; value: string }[];
}): Promise<RenderResult> {
  const url = new URL(input.path, input.origin);
  let browser: Browser | null = null;
  try {
    browser = await launch();
    const context = await browser.newContext({
      viewport: { width: 1240, height: 1754 },
    });
    if (input.cookies.length > 0) {
      await context.addCookies(
        input.cookies.map((c) => ({ ...c, url: url.origin })),
      );
    }
    await context.route(PDF_BLOCKED_REQUESTS, (route) => route.abort());
    const page = await context.newPage();
    const response = await page.goto(url.toString(), {
      waitUntil: "load",
      timeout: PAGE_TIMEOUT_MS,
    });
    // A gate that sends the member elsewhere (sign-in, an invite, approval)
    // or a page that fails is never saved as a PDF.
    if (!response || !response.ok()) return { ok: false, reason: "refused" };
    if (new URL(page.url()).pathname !== url.pathname) {
      return { ok: false, reason: "refused" };
    }
    // Only a page drawn by the print shell is a sheet; a refusal is not.
    const sheet = await page.$(`[${PRINT_SHEET_ATTR}]`);
    if (!sheet) return { ok: false, reason: "refused" };
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });
    return { ok: true, pdf };
  } catch (error) {
    // The first line only (Playwright's call log below it can quote the
    // page's address and cookies), with any secret taken out.
    const line =
      error instanceof Error
        ? (error.message.split("\n")[0] ?? "").slice(0, 200)
        : "unknown error";
    console.error(
      `[print-pdf] could not make the PDF: ${redactSecrets(line, process.env)}`,
    );
    return { ok: false, reason: "failed" };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
