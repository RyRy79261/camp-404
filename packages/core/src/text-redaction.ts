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
