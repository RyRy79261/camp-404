// Pure helpers for turning an in-app bug/feature report into a GitHub issue.
// No I/O here (the server action does the fetch) so this stays unit-testable.
//
// IMPORTANT: RyRy79261/camp-404 is a PUBLIC repo, so issue bodies are
// world-readable. Every piece of free text is PII-redacted before it goes in,
// and we never put a reporter's name or email in the body — only their opaque
// camp user id, which a captain can map back internally.

export type FeedbackKind = "bug" | "feature";

export const DESCRIPTION_MAX = 5000;
const TITLE_MAX = 100;
const ISSUE_BODY_MAX = 60_000; // GitHub's hard limit is 65536.

/** Labels applied to a new issue. `from-app` marks provenance for triage;
 *  `bug`/`enhancement` are GitHub's default labels. Missing labels are
 *  auto-created by the issues API on first use. */
export function labelsFor(kind: FeedbackKind): string[] {
  return kind === "bug"
    ? ["bug", "from-app"]
    : ["enhancement", "from-app"];
}

/**
 * Strip common PII patterns from free text. Defence in depth for a public
 * tracker — the modal also warns the user not to include personal details.
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
      // Local phone numbers: 123-456-7890, 123.456.7890
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[phone]")
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

/** Defuse backtick fences so user content can't break out of a code block. */
function fenced(content: string): string {
  return "```\n" + content.replace(/```/g, "''' ") + "\n```";
}

export interface BuildIssueInput {
  kind: FeedbackKind;
  /** Raw user description (will be sanitized here). */
  description: string;
  /** Whether any of the description came from voice dictation. */
  dictated: boolean;
  /** Opaque camp user id — safe to expose; maps internally, reveals no PII. */
  reporterRef: string;
  /** In-app path the report was filed from, e.g. "/captains/announcements". */
  route?: string | null;
}

export interface BuiltIssue {
  title: string;
  body: string;
  labels: string[];
}

/**
 * Assemble the issue title/body/labels from a sanitized report. Title is the
 * first line of the description (the reference's non-AI path); body carries the
 * description plus a small, PII-free provenance footer.
 */
export function buildFeedbackIssue(input: BuildIssueInput): BuiltIssue {
  const description = sanitizeReportText(input.description, DESCRIPTION_MAX);

  const firstLine = description.split("\n")[0]?.trim() ?? "";
  const title =
    firstLine.slice(0, TITLE_MAX) ||
    (input.kind === "bug" ? "Bug report" : "Feature request");

  const safeRoute = input.route
    ? sanitizeReportText(input.route, 300)
    : null;

  const footerBits = [
    "Filed via the in-app reporter" + (input.dictated ? " (voice-dictated)" : ""),
    `reporter: \`${input.reporterRef}\``,
    safeRoute ? `from: \`${safeRoute}\`` : null,
  ].filter(Boolean);

  const body = [
    "## Description",
    fenced(description),
    "---",
    `_${footerBits.join(" · ")}_`,
  ]
    .join("\n\n")
    .slice(0, ISSUE_BODY_MAX);

  return { title, body, labels: labelsFor(input.kind) };
}
