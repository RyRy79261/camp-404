"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { DefinitionIssue } from "@camp404/core";
import {
  pageBlocks,
  type Questionnaire,
  type QuestionnairePage,
} from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";

// Rendering for @camp404/core's `validateQuestionnaireDefinition` output (and
// the same issues `publishAction` returns).
//
// The validator addresses every defect with a DOTTED PATH into the definition
// — `pages[2].questions[0].options[1].goTo` — and, where it knows them, the
// page and block ids it belongs to. This module is the only place that knows
// how to read either, so the builder can hang each issue on the exact
// section / block / option it belongs to instead of dumping a wall of text.
//
// Two path dialects arrive here and both are handled:
//   - structural issues:  pages[2].questions[0].options[1]
//   - Zod shape issues:   pages.2.questions.0.prompt

export interface IssueLocation {
  pageIndex: number | null;
  blockIndex: number | null;
  optionIndex: number | null;
}

/** An issue with its place in the definition worked out once. */
export interface LocatedIssue extends DefinitionIssue {
  location: IssueLocation;
}

function segmentIndex(path: string, key: string): number | null {
  const match = new RegExp(`${key}(?:\\[(\\d+)\\]|\\.(\\d+))`).exec(path);
  if (!match) return null;
  const raw = match[1] ?? match[2];
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/**
 * Where in the definition an issue points. Nulls mean "not that specific".
 *
 * The page and block ids win when the issue carries them and the definition
 * still holds them (the ids survive a reorder the path does not); the path
 * decides otherwise, and always decides the option. When two blocks share the
 * id (a duplicate-id issue), the path picks which of them.
 */
export function issueLocation(
  issue: DefinitionIssue,
  definition?: Questionnaire,
): IssueLocation {
  const fromPath: IssueLocation = {
    pageIndex: segmentIndex(issue.path, "pages"),
    blockIndex: segmentIndex(issue.path, "questions"),
    optionIndex: segmentIndex(issue.path, "options"),
  };
  if (!definition || !issue.pageId) return fromPath;

  const pageIndex = definition.pages.findIndex((p) => p.id === issue.pageId);
  if (pageIndex < 0) return fromPath;
  const page = definition.pages[pageIndex]!;

  let blockIndex = fromPath.blockIndex;
  if (issue.blockId) {
    const matches = pageBlocks(page).flatMap((b, i) =>
      b.id === issue.blockId ? [i] : [],
    );
    if (matches.length > 0) {
      blockIndex =
        fromPath.blockIndex !== null && matches.includes(fromPath.blockIndex)
          ? fromPath.blockIndex
          : matches[0]!;
    }
  } else if (fromPath.pageIndex !== pageIndex) {
    // The path points into a page the id no longer names: trust the id for
    // the page and drop a block index that belonged to the other page.
    blockIndex = null;
  }
  return { pageIndex, blockIndex, optionIndex: fromPath.optionIndex };
}

/** Every issue with its location resolved against the live definition. */
export function locateIssues(
  issues: readonly DefinitionIssue[],
  definition: Questionnaire,
): LocatedIssue[] {
  return issues.map((issue) => ({
    ...issue,
    message: issueMessage(issue),
    location: issueLocation(issue, definition),
  }));
}

// Zod's own words for a missing value read like a stack trace ("Too small:
// expected string to have >=1 characters"). A draft's shape issues are almost
// always an empty box, so they are said plainly by the field they are about.
const SHAPE_MESSAGES: Record<string, string> = {
  prompt: "Write the question.",
  label: "Give this a label.",
  body: "Write the text.",
  bodyText: "Write the text.",
  headingText: "Write the heading.",
  heading: "Write the heading.",
  options: "Add at least 2 options.",
  steps: "Add at least 2 steps.",
  rows: "Add at least one row.",
  columns: "Add at least one column.",
  maxLength: "Set a maximum length of 1 or more.",
};

/** The words an author reads for one issue. */
export function issueMessage(issue: DefinitionIssue): string {
  if (issue.code !== "shape") return issue.message;
  const last =
    issue.path
      .split(/[.[\]]/)
      .filter(Boolean)
      .at(-1) ?? "";
  return SHAPE_MESSAGES[last] ?? issue.message;
}

/** Issues addressed at the questionnaire itself (its title, "no questions"). */
export function questionnaireIssues<T extends LocatedIssue>(
  issues: readonly T[],
): T[] {
  return issues.filter((i) => i.location.pageIndex === null);
}

/** Issues addressed at a section itself (its title, its `next` branch). */
export function sectionIssues<T extends LocatedIssue>(
  issues: readonly T[],
  pageIndex: number,
): T[] {
  return issues.filter(
    (i) => i.location.pageIndex === pageIndex && i.location.blockIndex === null,
  );
}

/** Issues on one block — including the ones on its options. */
export function blockIssues<T extends LocatedIssue>(
  issues: readonly T[],
  pageIndex: number,
  blockIndex: number,
): T[] {
  return issues.filter(
    (i) =>
      i.location.pageIndex === pageIndex &&
      i.location.blockIndex === blockIndex,
  );
}

/** Issues on one option of one block. */
export function optionIssues<T extends LocatedIssue>(
  issues: readonly T[],
  pageIndex: number,
  blockIndex: number,
  optionIndex: number,
): T[] {
  return issues.filter(
    (i) =>
      i.location.pageIndex === pageIndex &&
      i.location.blockIndex === blockIndex &&
      i.location.optionIndex === optionIndex,
  );
}

/** "Section 2 · Block 1 · Option 3" for the summary list. */
export function issueBreadcrumb(
  issue: LocatedIssue,
  sectionTitles: readonly string[],
): string {
  const loc = issue.location;
  if (loc.pageIndex === null) return "Questionnaire";
  const parts = [
    sectionTitles[loc.pageIndex]?.trim() || `Section ${loc.pageIndex + 1}`,
  ];
  if (loc.blockIndex !== null) parts.push(`Block ${loc.blockIndex + 1}`);
  if (loc.optionIndex !== null) parts.push(`Option ${loc.optionIndex + 1}`);
  return parts.join(" · ");
}

/** The element id the builder gives a section, so an issue can link to it. */
export function sectionAnchor(page: QuestionnairePage): string {
  return `section-${page.id}`;
}

/** The element id the builder gives a block. */
export function blockAnchor(blockId: string): string {
  return `block-${blockId}`;
}

/** The inline red note rendered next to an offending field. */
export function IssueNote({
  issues,
  className,
}: {
  issues: readonly DefinitionIssue[];
  className?: string;
}) {
  if (issues.length === 0) return null;
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {issues.map((issue, i) => (
        <li
          key={`${issue.path}-${i}`}
          className="flex items-start gap-1.5 text-xs text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The blocking-issues panel above the builder. Every issue is listed with the
 * place it belongs to — the author never has to guess which question broke.
 *
 * Camp 404 saves a half-built draft, so the panel says which step is blocked:
 * a draft save (only an unwritten question or option stops it) or publishing
 * (every rule).
 */
export const DefinitionIssuePanel = React.forwardRef<
  HTMLDivElement,
  {
    issues: readonly LocatedIssue[];
    sectionTitles: readonly string[];
    /** The step the issues stop. */
    blocking?: "save" | "publish";
    /** Links each issue to the section or block it is on. */
    anchorFor?: (issue: LocatedIssue) => string | null;
  }
>(function DefinitionIssuePanel(
  { issues, sectionTitles, blocking = "publish", anchorFor },
  ref,
) {
  if (issues.length === 0) return null;
  const step = blocking === "save" ? "this save" : "publishing";
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {issues.length === 1
          ? `1 problem is blocking ${step}`
          : `${issues.length} problems are blocking ${step}`}
      </p>
      <p className="text-xs text-muted-foreground">
        {blocking === "save"
          ? "A draft saves once every question, option and heading has its words."
          : "A questionnaire is published only once it holds together: every question written, branches that move forward, every section reachable."}
      </p>
      <ul className="flex flex-col gap-1.5">
        {issues.map((issue, i) => {
          const anchor = anchorFor?.(issue) ?? null;
          const where = issueBreadcrumb(issue, sectionTitles);
          return (
            <li key={`${issue.path}-${i}`} className="text-xs">
              {anchor ? (
                <a
                  href={`#${anchor}`}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {where}
                </a>
              ) : (
                <span className="font-medium text-foreground">{where}</span>
              )}
              <span className="text-muted-foreground"> — {issue.message}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
