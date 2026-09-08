import { afterEach, describe, expect, it } from "vitest";

// Deliberately NO `vi.mock("server-only", () => ({}))` here — that is the point
// of this file. `access-control.ts` opens with `import "server-only"`, whose
// real entrypoint throws on import outside a React Server Component, so without
// the `server-only` → `empty.js` alias in vitest.config.ts this import alone
// fails and the suite goes red. Every `lib/` module that guards itself is
// untestable until that alias exists; this test is what keeps it there.
import { isGodEmail } from "@/lib/access-control";

const ORIGINAL_GOD_EMAILS = process.env.GOD_EMAILS;

describe("server-only alias", () => {
  afterEach(() => {
    if (ORIGINAL_GOD_EMAILS === undefined) delete process.env.GOD_EMAILS;
    else process.env.GOD_EMAILS = ORIGINAL_GOD_EMAILS;
  });

  it("imports a server-only module and runs its exports", () => {
    process.env.GOD_EMAILS = "boss@camp404.test, Other@Camp404.test";

    expect(isGodEmail("boss@camp404.test")).toBe(true);
    // Case-insensitive on both sides, and whitespace around the CSV entries is
    // trimmed.
    expect(isGodEmail("OTHER@camp404.test")).toBe(true);
    expect(isGodEmail("nobody@camp404.test")).toBe(false);
    expect(isGodEmail(null)).toBe(false);
  });

  it("treats an unset GOD_EMAILS as an empty list", () => {
    delete process.env.GOD_EMAILS;

    expect(isGodEmail("boss@camp404.test")).toBe(false);
  });
});
