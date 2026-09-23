// Pure text-redaction kernel: strip PII/secrets from free text, then sanitize
// (redact + markup-strip + length-cap) before it lands anywhere world-readable.
// Framework-agnostic so apps/web (in-app feedback → public GitHub tracker) and
// any other surface that forwards user text outward can share one implementation.
//
// No I/O, no module-level mutable state — just deterministic string transforms.
//
// Redaction matches patterns, so it fails open: what it does not recognise
// passes through. It is a second line of defence, never "the report is
// anonymised". The structured-data scanner, the UUID rule and the linear
// markup strip are ported from the AfrikaBurn contributors app.

/** What a redaction replaced. */
export type RedactionKind =
  | "secret"
  | "link"
  | "handle"
  | "email"
  | "uuid"
  | "ref-code"
  | "phone"
  | "id-number"
  | "card"
  | "structured-data";

export interface RedactionResult {
  text: string;
  /** Each kind found, in rule order, for an honest "we removed X" note. */
  redacted: RedactionKind[];
}

/**
 * The rules, in the order they run. ORDER IS LOAD-BEARING:
 * - Secrets first, before the generic rules split a token apart.
 * - UUIDs before every digit rule. Without that, the card rule matched the
 *   digits of an all-numeric UUID, printed a false `[card]`, and left the
 *   rest of the UUID in the text.
 * - Our member and payment references (`C404-M017`, `C404-M017-2027-1`)
 *   before the digit rules, so none of the reference is left behind.
 */
const RULES: readonly {
  kind: RedactionKind;
  pattern: RegExp;
  to: string;
}[] = [
  // --- Secrets ---
  // Bearer / Authorization tokens
  {
    kind: "secret",
    pattern: /\bBearer\s+[A-Za-z0-9._-]+/gi,
    to: "Bearer [token]",
  },
  // JWTs (header.payload.signature)
  {
    kind: "secret",
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    to: "[jwt]",
  },
  // Common API-key shapes: sk-/pk-, GitHub ghp_/gho_/…, AWS AKIA, Slack xox*
  {
    kind: "secret",
    pattern: /\b(?:sk|pk)-[A-Za-z0-9]{16,}\b/g,
    to: "[secret]",
  },
  { kind: "secret", pattern: /\bgh[posu]_[A-Za-z0-9]{20,}\b/g, to: "[secret]" },
  { kind: "secret", pattern: /\bAKIA[0-9A-Z]{16}\b/g, to: "[secret]" },
  {
    kind: "secret",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    to: "[secret]",
  },
  // Token-bearing URL query params (signed URLs, OAuth codes)
  {
    kind: "secret",
    pattern:
      /([?&](?:token|key|secret|sig|signature|password|access_token|code|auth)=)[^\s&#]+/gi,
    to: "$1[redacted]",
  },
  // Long opaque runs — catch-all for keys / signed-URL blobs
  {
    kind: "secret",
    pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
    to: "[redacted]",
  },
  // --- Messenger links + social handles ---
  { kind: "link", pattern: /\b(?:t\.me|wa\.me)\/\S+/gi, to: "[link]" },
  { kind: "handle", pattern: /(^|\s)@[A-Za-z0-9_]{2,}\b/g, to: "$1[handle]" },
  // --- Personal identifiers ---
  {
    kind: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    to: "[email]",
  },
  {
    kind: "uuid",
    pattern:
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    to: "[uuid]",
  },
  {
    kind: "ref-code",
    pattern: /\bC404-M\d{3,}(?:-\d{4}-\d+)?\b/g,
    to: "[ref]",
  },
  // International phone numbers — consume ALL trailing digit groups so the
  // last group can't leak (e.g. "+27 82 555 1234" → "[phone]", not "[phone] 1234").
  {
    kind: "phone",
    pattern: /\+\d{1,3}(?:[-.\s]?\d{1,4}){1,6}/g,
    to: "[phone]",
  },
  // Local phone numbers: 123-456-7890, 123.456.7890, 123 456 7890
  {
    kind: "phone",
    pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    to: "[phone]",
  },
  // SA ID / SSN-like 13- and 9-digit runs
  { kind: "id-number", pattern: /\b\d{13}\b/g, to: "[id]" },
  { kind: "id-number", pattern: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, to: "[id]" },
  // Credit-card-like groups
  {
    kind: "card",
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    to: "[card]",
  },
];

const STRUCTURED_DATA_PLACEHOLDER = "[structured data removed]";

/** The longest placeholder, in characters, with room to spare. */
const MAX_PLACEHOLDER_LENGTH = 32;

/**
 * The placeholders the rules write, and the kind each one stands for. The
 * structured-data scanner keeps them, so text that is sanitised twice (the
 * feedback action cleans a report before the AI pass, and the issue builder
 * cleans the AI's output again) keeps its `[email]` and still reports it.
 */
const PLACEHOLDERS: ReadonlyMap<string, RedactionKind> = new Map([
  ["[token]", "secret"],
  ["[jwt]", "secret"],
  ["[secret]", "secret"],
  ["[redacted]", "secret"],
  ["[link]", "link"],
  ["[handle]", "handle"],
  ["[email]", "email"],
  ["[uuid]", "uuid"],
  ["[ref]", "ref-code"],
  ["[phone]", "phone"],
  ["[id]", "id-number"],
  ["[card]", "card"],
  [STRUCTURED_DATA_PLACEHOLDER, "structured-data"],
]);

/** The longest JSON-like span the scanner removes whole. */
const MAX_STRUCTURED_SPAN = 4_000;

/**
 * Remove JSON objects and arrays, nested contents included. A serialised
 * roster or profile inside an error message carries names and notes that no
 * pattern can recognise, so the whole structure goes.
 *
 * A depth-counting scan, not a regex: a regex cannot match nested braces, and
 * would remove only the inner `{"x":1}` of `{"name":"Jo","meta":{"x":1}}`,
 * leaving the name. One forward pass per bracket, capped at
 * MAX_STRUCTURED_SPAN; an unbalanced or over-long span is left for the other
 * rules.
 */
function stripStructuredData(text: string, found: Set<RedactionKind>): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (char !== "{" && char !== "[") {
      out += char;
      i += 1;
      continue;
    }

    if (char === "[") {
      const head = text.slice(i, i + MAX_PLACEHOLDER_LENGTH);
      const placeholder = head.slice(0, head.indexOf("]") + 1);
      const kind = PLACEHOLDERS.get(placeholder);
      if (kind) {
        found.add(kind);
        out += placeholder;
        i += placeholder.length;
        continue;
      }
    }

    let depth = 0;
    let end = -1;
    for (let j = i; j < text.length && j - i <= MAX_STRUCTURED_SPAN; j += 1) {
      const c = text[j];
      if (c === "{" || c === "[") depth += 1;
      else if (c === "}" || c === "]") {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) {
      out += char;
      i += 1;
      continue;
    }
    out += STRUCTURED_DATA_PLACEHOLDER;
    found.add("structured-data");
    i = end + 1;
  }
  return out;
}

/**
 * Strip markup tags with one linear scan. Not `replace(/<[^>]*>/g, "")`,
 * which backtracks quadratically on `<<<<…`. An unterminated `<` is kept with
 * the rest of the text: in a bug report it is far more often a comparison
 * ("count < 10") than a tag. Escaping it is the renderer's job (see
 * github-feedback.ts), because a code block shows an escape literally.
 */
function stripMarkup(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, lt);
    const gt = text.indexOf(">", lt + 1);
    if (gt === -1) {
      out += text.slice(lt);
      break;
    }
    i = gt + 1;
  }
  return out;
}

/** Every kind, in the order redaction finds them. */
const KIND_ORDER: readonly RedactionKind[] = [
  "structured-data",
  ...new Set(RULES.map((rule) => rule.kind)),
];

/**
 * Strip PII, secrets and JSON-like structures from free text, and say what
 * was found. Defence in depth for a public tracker — callers should also warn
 * the user not to include personal details.
 */
export function redactPii(input: string): RedactionResult {
  const found = new Set<RedactionKind>();
  let text = stripStructuredData(input, found);
  for (const rule of RULES) {
    // The patterns carry /g, which makes test() stateful: reset lastIndex
    // before each use so a shared regex never skips a match.
    rule.pattern.lastIndex = 0;
    if (!rule.pattern.test(text)) continue;
    found.add(rule.kind);
    rule.pattern.lastIndex = 0;
    text = text.replace(rule.pattern, rule.to);
  }
  return {
    text,
    redacted: KIND_ORDER.filter((kind) => found.has(kind)),
  };
}

/** Strip markup, redact, trim and length-cap. */
export function sanitizeReportText(
  text: string,
  maxLength: number,
): RedactionResult {
  if (!text) return { text: "", redacted: [] };
  const { text: redacted, redacted: kinds } = redactPii(stripMarkup(text));
  return { text: redacted.trim().slice(0, maxLength), redacted: kinds };
}

const REDACTION_LABELS: Record<RedactionKind, string> = {
  secret: "secrets and tokens",
  link: "messenger links",
  handle: "social handles",
  email: "email addresses",
  uuid: "internal ids",
  "ref-code": "member references",
  phone: "phone numbers",
  "id-number": "ID numbers",
  card: "card numbers",
  "structured-data": "structured data",
};

/**
 * One honest sentence about what redaction removed, for the end of a public
 * issue, in rule order whatever order `kinds` is in. It never says
 * "anonymised": redaction only removes what it recognises.
 */
export function describeRedactions(kinds: readonly RedactionKind[]): string {
  const caveat =
    "Redaction matches patterns and can miss things, so treat this report as possibly still sensitive.";
  if (kinds.length === 0) {
    return `No personal data was recognised in this report. ${caveat}`;
  }
  const list = KIND_ORDER.filter((kind) => kinds.includes(kind))
    .map((kind) => REDACTION_LABELS[kind])
    .join(", ");
  return `Recognised and removed before filing: ${list}. ${caveat}`;
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
  "BETTER_AUTH_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET",
  "DATABASE_URL",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "GITHUB_FEEDBACK_TOKEN",
  "GOD_EMAILS",
  "GOOGLE_CLIENT_SECRET",
  "GROQ_API_KEY",
  "INVITE_CODES",
  "PGCRYPTO_KEY",
  "RESEND_API_KEY",
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
 * The user and password part of any `scheme://user:password@host` URL. A
 * driver error quotes the connection string it failed on, and it may be a
 * different URL from the one this process holds (the pooler host, another
 * branch), so the value pass alone cannot catch it. The host stays: it names
 * the database and is not a credential.
 */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@"'`]+@/gi;

/**
 * Three-pass scrubber for text about to be logged or handed back to a caller
 * (an error message, a stack trace, a cron response body).
 *
 * Pass 0 — URL: remove the credentials from every `scheme://user:pass@` URL.
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

  // After the value pass, so a DATABASE_URL this process holds still reads as
  // its name; this pass catches the URLs it does not hold.
  out = out.replace(URL_CREDENTIALS, "$1[redacted]@");

  for (const [name, pattern] of NAME_PASS) {
    out = out.replace(pattern, `$1[redacted:${name}]`);
  }

  return out;
}
