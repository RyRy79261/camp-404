import { describe, it, expect } from "vitest";
import {
  sha256,
  constantTimeEqual,
  verifyPkce,
  generateOpaqueToken,
} from "@/lib/mcp/tokens";

describe("sha256", () => {
  it("is the deterministic hex SHA-256", () => {
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("constantTimeEqual", () => {
  it("is true only for identical strings", () => {
    expect(constantTimeEqual("secret", "secret")).toBe(true);
    expect(constantTimeEqual("secret", "secres")).toBe(false);
    expect(constantTimeEqual("secret", "secretx")).toBe(false); // length mismatch
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("verifyPkce", () => {
  // RFC 7636 Appendix B test vector.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("S256: accepts the matching verifier", () => {
    expect(verifyPkce(challenge, "S256", verifier)).toBe(true);
  });
  it("S256: rejects a wrong or tampered verifier", () => {
    expect(verifyPkce(challenge, "S256", verifier + "x")).toBe(false);
    expect(verifyPkce(challenge, "S256", "totally-wrong-verifier")).toBe(false);
  });
  it("S256: rejects a tampered challenge", () => {
    expect(verifyPkce(challenge.slice(0, -1) + "X", "S256", verifier)).toBe(
      false,
    );
  });
  it("plain: matches verbatim", () => {
    expect(verifyPkce("abc123", "plain", "abc123")).toBe(true);
    expect(verifyPkce("abc123", "plain", "abc124")).toBe(false);
  });
});

describe("generateOpaqueToken", () => {
  it("produces unique, high-entropy, base64url tokens", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
