// Pure text-redaction kernel: strip PII/secrets from free text, then sanitize
// (redact + HTML-strip + length-cap) before it lands anywhere world-readable.
// Framework-agnostic so apps/web (in-app feedback → public GitHub tracker) and
// any other surface that forwards user text outward can share one implementation.
//
// No I/O, no module-level mutable state — just deterministic string transforms.

/**
 * Strip common PII patterns from free text. Defence in depth for a public
 * tracker — callers should also warn the user not to include personal details.
 * Ported from intake-tracker's redactPii.
 */
export function redactPii(input: string): string {
  return (
    input
      // --- Secrets first (before generic patterns split them apart) ---
      // Bearer / Authorization tokens
      .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [token]")
      // JWTs (header.payload.signature)
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]")
      // Common API-key shapes: sk-/pk-, GitHub ghp_/gho_/…, AWS AKIA, Slack xox*
      .replace(/\b(?:sk|pk)-[A-Za-z0-9]{16,}\b/g, "[secret]")
      .replace(/\bgh[posu]_[A-Za-z0-9]{20,}\b/g, "[secret]")
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[secret]")
      .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[secret]")
      // Token-bearing URL query params (signed URLs, OAuth codes)
      .replace(
        /([?&](?:token|key|secret|sig|signature|password|access_token|code|auth)=)[^\s&#]+/gi,
        "$1[redacted]",
      )
      // Long opaque runs — catch-all for keys / signed-URL blobs
      .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, "[redacted]")
      // Messenger links + social handles
      .replace(/\b(?:t\.me|wa\.me)\/\S+/gi, "[link]")
      .replace(/(^|\s)@[A-Za-z0-9_]{2,}\b/g, "$1[handle]")
      // --- Personal identifiers ---
      // Email addresses
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]")
      // International phone numbers — consume ALL trailing digit groups so the
      // last group can't leak (e.g. "+27 82 555 1234" → "[phone]", not "[phone] 1234").
      .replace(/\+\d{1,3}(?:[-.\s]?\d{1,4}){1,6}/g, "[phone]")
      // Local phone numbers: 123-456-7890, 123.456.7890, 123 456 7890
      .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[phone]")
      // SA ID / SSN-like 13- and 9-digit runs
      .replace(/\b\d{13}\b/g, "[id]")
      .replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, "[id]")
      // Credit-card-like groups
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[card]")
  );
}

/** Redact PII, strip HTML tags, collapse, and length-cap. */
export function sanitizeReportText(text: string, maxLength: number): string {
  if (!text) return "";
  return redactPii(text)
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, maxLength);
}

// --- Secret scrubbing -----------------------------------------------------
// `redactPii` catches secrets that LOOK like secrets (JWTs, `sk-…`, long
// opaque runs). It cannot catch a value that looks ordinary — a short-ish
// pgcrypto key, a comma-separated GOD_EMAILS list, a bare bot token. Those we
// know by name, so we scrub them by name.

/**
 * The environment variables whose VALUES are secret. Camp 404's `process.env`
 * surface is wider than this; everything left out is either public by design
 * (`NEXT_PUBLIC_*`, `VERCEL_URL`), a mode flag (`NODE_ENV`, `CI`,
 * `E2E_TEST_MODE`, `MOBILE_BUILD`, `NEXT_PHASE`, `NEXT_RUNTIME`,
 * `CAPTURE_THEME`), or test plumbing (`PLAYWRIGHT_*`, `NEON_LOCAL_PROXY`) —
 * redacting those would blank ordinary words like "production" or "1".
 *
 * core never reads `process.env` itself (see index.ts's dependency rule), so
 * `redactSecrets` takes the env in as an argument.
 */
export const SECRET_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET",
  "DATABASE_URL",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "GITHUB_FEEDBACK_TOKEN",
  "GOD_EMAILS",
  "GROQ_API_KEY",
  "INVITE_CODES",
  "NEON_AUTH_COOKIE_SECRET",
  "PGCRYPTO_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
] as const;

export type SecretEnvKey = (typeof SECRET_ENV_KEYS)[number];

/**
 * Shortest env value we will scrub by literal match. A 2-character value ("hi",
 * "1", a dev-stub key) occurs inside ordinary prose constantly, so redacting it
 * would shred the surrounding text and tell the reader nothing. Below this
 * length only the name-pass (`KEY=…`) applies.
 */
const MIN_SECRET_LENGTH = 8;

const NAME_PASS = SECRET_ENV_KEYS.map(
  (name) =>
    [
      name,
      // `KEY=value`, `KEY: value`, `KEY="value"` — the shapes a secret takes
      // when a stack trace, connection string or shell line is logged verbatim.
      new RegExp(`(\\b${name}\\s*[=:]\\s*)(?:"[^"]*"|'[^']*'|\\S+)`, "g"),
    ] as const,
);

/**
 * Two-pass scrubber for text about to be logged or handed back to a caller
 * (an error message, a stack trace, a cron response body).
 *
 * Pass 1 — value: replace every literal occurrence of a known secret's value.
 * Longest value first, so a secret that contains a shorter one still wins.
 * Pass 2 — name: replace whatever follows `KEY=` / `KEY:`, which catches a
 * secret this process doesn't hold (a rotated key, another environment's).
 *
 * Idempotent: the replacement token carries no secret and the name-pass
 * rewrites its own output to itself.
 */
export function redactSecrets(
  text: string,
  env: Record<string, string | undefined>,
): string {
  if (!text) return "";

  let out = text;

  const values = SECRET_ENV_KEYS.map((name) => ({ name, value: env[name] }))
    .filter(
      (entry): entry is { name: SecretEnvKey; value: string } =>
        typeof entry.value === "string" &&
        entry.value.length >= MIN_SECRET_LENGTH,
    )
    .sort((a, b) => b.value.length - a.value.length);

  for (const { name, value } of values) {
    // split/join, not RegExp — an env value can contain regex metacharacters
    // (a DATABASE_URL is full of them) and must match literally.
    out = out.split(value).join(`[redacted:${name}]`);
  }

  for (const [name, pattern] of NAME_PASS) {
    out = out.replace(pattern, `$1[redacted:${name}]`);
  }

  return out;
}
