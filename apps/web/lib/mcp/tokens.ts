import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * SHA-256 hash, hex-encoded. Used for storing access + refresh + client
 * secret hashes in the DB so a leaked snapshot can't be used to forge a
 * bearer token.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Generate a cryptographically random opaque token, base64url-encoded.
 * Default 32 bytes → 256 bits of entropy, well beyond the OAuth 2.1
 * recommendation of 128 bits.
 */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Constant-time equality on two strings of arbitrary length. Returns
 * false for length mismatches (safe — the caller already lost on
 * structural comparison).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Verify a PKCE code_verifier against the stored code_challenge per
 * RFC 7636. Supports the two challenge methods the OAuth 2.1 spec
 * mandates: `S256` (required) and `plain` (allowed but discouraged).
 *
 * For S256 the challenge is `base64url(sha256(verifier))` and we
 * recompute it on the verifier we receive — byte-wise compared in
 * constant time.
 */
export function verifyPkce(
  challenge: string,
  method: "S256" | "plain",
  verifier: string,
): boolean {
  if (method === "plain") {
    return constantTimeEqual(challenge, verifier);
  }
  // S256: base64url(SHA256(ASCII(verifier)))
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return constantTimeEqual(challenge, computed);
}
