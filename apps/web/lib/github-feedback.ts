// Pure helpers for turning an in-app bug/feature report into a GitHub issue.
// No I/O here (the server action does the fetch) so this stays unit-testable.
//
// IMPORTANT: RyRy79261/camp-404 is a PUBLIC repo, so issue bodies are
// world-readable. Every piece of free text is PII-redacted before it goes in,
// and we never put a reporter's name or email in the body — only their opaque
// camp user id, which a captain can map back internally.

export type FeedbackKind = "bug" | "feature";

/** Result of the optional AI restructuring pass (see lib/feedback-ai.ts). */
export interface StructuredReport {
  title: string;
  summary: string;
  stepsToReproduce?: string[];
  expected?: string;
  actual?: string;
  severity?: "critical" | "high" | "medium" | "low";
}

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

/** Defuse backtick fences so user content can't break out of a code block. */
function fenced(content: string): string {
  return "```\n" + content.replace(/```/g, "''' ") + "\n```";
}

/**
 * Make a value safe to drop inside a Markdown inline-code span: strip backticks
 * (which would close the span and let following text inject Markdown) and
 * collapse newlines. Used for the footer's reporter id + route, since `route`
 * is client-supplied to the action and a crafted request could carry either.
 */
function inlineCode(value: string): string {
  return value.replace(/`/g, "").replace(/\s*\n\s*/g, " ").trim();
}

/**
 * Make AI-derived free text safe to drop into the Markdown body as prose:
 * defuse ``` fences and collapse newlines so it can't inject block-level
 * Markdown (headings, fences, blockquotes, lists all require a line start).
 * Inline emphasis is harmless. The model is faithful to user text, so this is
 * defence in depth — the structured fields are still user-derived.
 */
function mdInline(value: string): string {
  return value.replace(/```/g, "''' ").replace(/\s*\n\s*/g, " ").trim();
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
  /** Optional AI-restructured report; when present it shapes the body. */
  structured?: StructuredReport | null;
}

export interface BuiltIssue {
  title: string;
  body: string;
  labels: string[];
}

function fallbackTitle(kind: FeedbackKind): string {
  return kind === "bug" ? "Bug report" : "Feature request";
}

/** Title + body sections for a plain (non-AI) report. */
function plainParts(rawDescription: string, kind: FeedbackKind) {
  const description = sanitizeReportText(rawDescription, DESCRIPTION_MAX);
  const firstLine = description.split("\n")[0]?.trim() ?? "";
  const title = firstLine.slice(0, TITLE_MAX) || fallbackTitle(kind);
  return { title, sections: ["## Description", fenced(description)] };
}

/** Title + body sections for an AI-restructured report. Every field is
 *  re-sanitized — the model can echo PII from the raw description. */
function structuredParts(s: StructuredReport, kind: FeedbackKind) {
  // Markdown-inert prose for the AI free-text fields; our own `## …` headings
  // and the severity hint below are trusted (not user-derived). The title goes
  // into GitHub's issue title, which isn't rendered as Markdown.
  const safe = (v: string, max: number) => mdInline(sanitizeReportText(v, max));
  const title = sanitizeReportText(s.title, TITLE_MAX) || fallbackTitle(kind);
  const sections = [safe(s.summary, 2000)];
  if (s.stepsToReproduce?.length) {
    sections.push(
      "## Steps to reproduce\n" +
        s.stepsToReproduce
          .map((step, i) => `${i + 1}. ${safe(step, 500)}`)
          .join("\n"),
    );
  }
  if (s.expected) {
    sections.push("## Expected\n" + safe(s.expected, 1000));
  }
  if (s.actual) {
    sections.push("## Actual\n" + safe(s.actual, 1000));
  }
  if (s.severity) sections.push(`_Severity hint: ${s.severity}_`);
  return { title, sections };
}

/**
 * Assemble the issue title/body/labels. Without `structured`, the body is the
 * fenced description with a first-line title; with it, a restructured
 * summary/steps/expected/actual. A small PII-free provenance footer is common
 * to both.
 */
export function buildFeedbackIssue(input: BuildIssueInput): BuiltIssue {
  const safeRoute = input.route
    ? inlineCode(sanitizeReportText(input.route, 300))
    : null;
  const reporter = inlineCode(input.reporterRef);
  const footer = `_${[
    "Filed via the in-app reporter" + (input.dictated ? " (voice-dictated)" : ""),
    `reporter: \`${reporter}\``,
    safeRoute ? `from: \`${safeRoute}\`` : null,
  ]
    .filter(Boolean)
    .join(" · ")}_`;

  const { title, sections } = input.structured
    ? structuredParts(input.structured, input.kind)
    : plainParts(input.description, input.kind);

  const body = [...sections, "---", footer]
    .join("\n\n")
    .slice(0, ISSUE_BODY_MAX);

  return { title, body, labels: labelsFor(input.kind) };
}
