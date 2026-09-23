import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The e2e-db run's inbox. The server started by playwright.db.config.ts gets
// AUTH_EMAIL_CAPTURE_FILE, and @camp404/auth's sendAuthEmail appends one JSON
// line per auth email to it instead of sending anything. The app honours the
// file only under E2E_TEST_MODE and off Vercel (resolveAuthEmailCaptureFile),
// so no deployment ever writes one. Git ignores .e2e-mail/.

/** Absolute, so the dev server and the specs agree whatever their cwd. */
export const AUTH_EMAIL_CAPTURE_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.e2e-mail/auth-mail.jsonl",
);

type AuthMailKind =
  | "reset"
  | "verify"
  | "password-reset-completed"
  | "password-set";

interface CapturedMail {
  at: string;
  to: string;
  kind: AuthMailKind;
  subject: string;
  text: string;
  url: string | null;
}

async function readMail(): Promise<CapturedMail[]> {
  let raw: string;
  try {
    raw = await readFile(AUTH_EMAIL_CAPTURE_FILE, "utf8");
  } catch {
    return []; // nothing captured yet
  }
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as CapturedMail);
}

/**
 * Wait up to 15 s for an auth email of `kind` to `to`, written at or after
 * `since`, and return its link. The file outlives a run, so `since` (and a
 * unique address per test) keeps an older mail from answering.
 */
export async function waitForAuthMail(
  to: string,
  kind: AuthMailKind,
  since: Date,
): Promise<string> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const match = (await readMail())
      .filter(
        (m) =>
          m.to === to &&
          m.kind === kind &&
          Date.parse(m.at) >= since.getTime() &&
          m.url,
      )
      .at(-1);
    if (match?.url) return match.url;
    if (Date.now() > deadline) {
      throw new Error(
        `No "${kind}" email to ${to} since ${since.toISOString()} in ${AUTH_EMAIL_CAPTURE_FILE}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
