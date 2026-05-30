import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Symmetric encryption helpers for ID-document fields stored in
 * `users.passport_encrypted`, `users.sa_id_encrypted`,
 * `users.eft_details_encrypted`, and `reimbursements.account_details_encrypted`.
 *
 * The schema labels these columns "pgcrypto-encrypted" — historically
 * the plan was server-side `pgp_sym_encrypt`. We use Node's built-in
 * AES-256-GCM instead: same threat model (single shared key from
 * `PGCRYPTO_KEY` env var, leak of the key compromises both schemes),
 * fewer moving parts (no extension dependency, no SQL fragments), and
 * the ciphertext fits in the existing text columns as base64.
 *
 * Format of the stored string: base64(iv ‖ tag ‖ ciphertext) where
 *   iv = 12 random bytes
 *   tag = 16 byte GCM auth tag
 *   ciphertext = AES-256-GCM(plaintext)
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_SALT = "camp404-pgcrypto-v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.PGCRYPTO_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      "PGCRYPTO_KEY env var is required and must be at least 16 characters.",
    );
  }
  cachedKey = scryptSync(raw, KEY_SALT, 32);
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decrypt(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Ciphertext is too short to be valid.");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}

/** Decrypt-or-null helper for nullable stored columns. */
export function decryptOrNull(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    return null;
  }
}
