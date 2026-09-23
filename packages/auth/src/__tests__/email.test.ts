import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendAuthEmail } from "../email";

// The e2e capture file: a Playwright run reads reset and verify links from it
// instead of a real inbox. It must never be written, and nothing must be sent
// instead, anywhere but a local e2e run.

describe("sendAuthEmail capture file", () => {
  let dir: string;
  let file: string;
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "camp404-auth-mail-"));
    // A nested path: the parent directory does not exist yet.
    file = join(dir, "nested", "auth-mail.jsonl");
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("writes one JSON line with the link in a local e2e run, and sends nothing", async () => {
    const url =
      "http://localhost:3100/api/auth/reset-password/tok?callbackURL=x";
    const sent = await sendAuthEmail(
      {
        E2E_TEST_MODE: "1",
        AUTH_EMAIL_CAPTURE_FILE: file,
        // Even with a provider set, the capture wins: a test run never mails.
        RESEND_API_KEY: "re_x",
        RESEND_FROM_EMAIL: "n@x",
      },
      { to: "a@example.com", kind: "reset", url },
    );

    expect(sent).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    const mail = JSON.parse(lines[0]!);
    expect(mail).toMatchObject({ to: "a@example.com", kind: "reset", url });
    expect(mail.subject).toContain("Reset");
    expect(mail.text).toContain(url);
    expect(Number.isNaN(Date.parse(mail.at))).toBe(false);

    // A second mail appends rather than overwrites.
    await sendAuthEmail(
      { E2E_TEST_MODE: "1", AUTH_EMAIL_CAPTURE_FILE: file },
      { to: "b@example.com", kind: "verify", url: "u2" },
    );
    expect((await readFile(file, "utf8")).trim().split("\n")).toHaveLength(2);
  });

  it("writes nothing and sends nothing on a Vercel deployment", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const sent = await sendAuthEmail(
      {
        E2E_TEST_MODE: "1",
        AUTH_EMAIL_CAPTURE_FILE: file,
        VERCEL_ENV: "preview",
      },
      { to: "a@example.com", kind: "reset", url: "secret-link" },
    );

    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(readFile(file, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("never throws when the file cannot be written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The temp directory is a directory, so appending to it fails.
    const sent = await sendAuthEmail(
      { E2E_TEST_MODE: "1", AUTH_EMAIL_CAPTURE_FILE: dir },
      { to: "a@example.com", kind: "reset", url: "u" },
    );
    expect(sent).toBe(false);
  });
});
