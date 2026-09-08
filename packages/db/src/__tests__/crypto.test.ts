import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Type-only: the runtime binding must come from the per-test dynamic import
// below, so the module registry reset actually takes effect.
import type * as CryptoNs from "../crypto";

// crypto.ts derives the AES key once and caches it in a module global, so a
// "wrong PGCRYPTO_KEY" scenario is only reachable by resetting the module
// registry between imports. Every test loads its own copy for that reason —
// importing once at the top would make the key-rotation test a false pass.
const KEY_A = "camp404-test-key-alpha";
const KEY_B = "camp404-test-key-bravo";

async function loadCrypto(key: string): Promise<typeof CryptoNs> {
  vi.resetModules();
  process.env.PGCRYPTO_KEY = key;
  return import("../crypto");
}

const originalKey = process.env.PGCRYPTO_KEY;

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The failure path is meant to be loud; keep it out of the test output while
  // still letting individual tests assert on what it said.
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.PGCRYPTO_KEY;
  else process.env.PGCRYPTO_KEY = originalKey;
});

describe("decryptField", () => {
  it("reports an empty column as absent, not unreadable", async () => {
    const { decryptField } = await loadCrypto(KEY_A);
    expect(decryptField(null)).toEqual({ state: "absent", value: null });
    expect(decryptField(undefined)).toEqual({ state: "absent", value: null });
    // sanitiseAccount (account.ts) scrubs to "", not NULL — a scrubbed row is
    // absent, and must never be reported as an encryption failure.
    expect(decryptField("")).toEqual({ state: "absent", value: null });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("round-trips a value encrypted under the same key", async () => {
    const { encrypt, decryptField } = await loadCrypto(KEY_A);
    expect(decryptField(encrypt("A12345678"))).toEqual({
      state: "ok",
      value: "A12345678",
    });
  });

  it("reports ciphertext written under a DIFFERENT key as unreadable, never absent", async () => {
    const { encrypt } = await loadCrypto(KEY_A);
    const stored = encrypt("9001015800089");

    // The rotation: a new process boots with a different PGCRYPTO_KEY.
    const { decryptField } = await loadCrypto(KEY_B);
    const read = decryptField(stored);

    expect(read.state).toBe("unreadable");
    expect(read.state).not.toBe("absent");
    expect(read.value).toBeNull();
  });

  it("reports a corrupt or truncated stored value as unreadable rather than throwing", async () => {
    const { encrypt, decryptField } = await loadCrypto(KEY_A);
    // Too short to hold an IV + tag at all.
    expect(decryptField("not-base64-at-all").state).toBe("unreadable");
    // Long enough to parse, but the auth tag will not verify.
    const tampered = `${encrypt("A12345678").slice(0, -8)}AAAAAAAA`;
    expect(decryptField(tampered).state).toBe("unreadable");
  });

  it("logs the failure without leaking the ciphertext, the plaintext or the key", async () => {
    const { encrypt } = await loadCrypto(KEY_A);
    const stored = encrypt("SECRET-PLAINTEXT-42");

    const { decryptField } = await loadCrypto(KEY_B);
    decryptField(stored);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = (errorSpy.mock.calls[0] ?? []).map(String).join(" ");
    expect(logged).toContain("PGCRYPTO_KEY");
    expect(logged).not.toContain(stored);
    expect(logged).not.toContain("SECRET-PLAINTEXT-42");
    expect(logged).not.toContain(KEY_A);
    expect(logged).not.toContain(KEY_B);
  });
});

describe("decryptOrNull", () => {
  it("still collapses absent and unreadable to null for its existing callers", async () => {
    const { encrypt } = await loadCrypto(KEY_A);
    const stored = encrypt("A12345678");

    const { decryptOrNull } = await loadCrypto(KEY_B);
    expect(decryptOrNull(null)).toBeNull();
    expect(decryptOrNull("")).toBeNull();
    expect(decryptOrNull(stored)).toBeNull();
  });

  it("returns the plaintext when the key is right", async () => {
    const { encrypt, decryptOrNull } = await loadCrypto(KEY_A);
    expect(decryptOrNull(encrypt("A12345678"))).toBe("A12345678");
  });

  it("now logs on the failure path it used to swallow silently", async () => {
    const { encrypt } = await loadCrypto(KEY_A);
    const stored = encrypt("A12345678");

    const { decryptOrNull } = await loadCrypto(KEY_B);
    decryptOrNull(stored);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
