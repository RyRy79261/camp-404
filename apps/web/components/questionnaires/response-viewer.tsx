"use client";

import Link from "next/link";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";

// One member's answers, from AfrikaBurn's response viewer
// (apps/web/components/questionnaire/response-viewer.tsx): the dialog the
// results table opens, and the question-and-answer list it holds.
//
// Presentational only. Every answer arrives already turned into text on the
// server, through the one label path the table and the CSV use
// (`formatAnswer` in [key]/responses/answer-values.ts), so this file resolves
// no option labels of its own. Who may read these answers is decided before
// the page renders: results are captain-only.

/** One question and what this member answered. */
export interface ResponseAnswer {
  /** The response-map key. */
  id: string;
  /** The question's prompt, or the stored key of a removed question. */
  label: string;
  /** The answer as text; empty for no answer. */
  value: string;
  /** True when the questionnaire no longer asks this question. */
  removed: boolean;
}

/** A member's finished answers, as the viewer shows them. */
export interface ViewedResponse {
  name: string;
  /** When they finished, formatted for the camp's time zone. */
  submittedLabel: string;
  /** The definition version they answered, when recorded. */
  version: string | null;
  answers: ResponseAnswer[];
  /** The member's own answers page — the deep link. */
  href: string;
}

/**
 * The question-and-answer list. Shared by the dialog and the member's own
 * answers page, so the two can't drift into two readings of one response.
 */
export function ResponseAnswers({
  answers,
  className,
}: {
  answers: readonly ResponseAnswer[];
  className?: string;
}) {
  return (
    <dl className={className ?? "flex flex-col gap-3"}>
      {answers.map((answer) => (
        <div key={answer.id} className="flex flex-col gap-0.5">
          <dt className="flex items-start justify-between gap-3 text-sm font-medium">
            <span className="min-w-0 flex-1 break-words">{answer.label}</span>
            {answer.removed && (
              <Badge variant="warning" className="shrink-0">
                removed
              </Badge>
            )}
          </dt>
          <dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {answer.value || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Read one respondent's answers in a dialog. Controlled: the table owns which
 * row is open, so one dialog serves every row.
 */
export function ResponseViewer({
  response,
  onOpenChange,
}: {
  /** The response to show; null closes the dialog. */
  response: ViewedResponse | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={response !== null} onOpenChange={onOpenChange}>
      {/* Capped, with the answer list scrolling inside it: a long response
          centred with a translate would otherwise grow off both ends of the
          viewport with nothing to scroll (AfrikaBurn's fix, kept). */}
      <DialogContent className="max-h-[85svh]">
        <DialogHeader>
          <DialogTitle>
            {response ? `${response.name}’s response` : "Response"}
          </DialogTitle>
          <DialogDescription>
            {response
              ? `Submitted ${response.submittedLabel}${response.version ? ` · version ${response.version}` : ""}`
              : "Submitted"}
          </DialogDescription>
        </DialogHeader>
        {response && (
          <ResponseAnswers
            answers={response.answers}
            className="flex max-h-[60svh] min-h-0 flex-col gap-3 overflow-y-auto"
          />
        )}
        {response && (
          <DialogFooter>
            <Button asChild variant="outline" size="sm">
              <Link href={response.href}>Open as a page</Link>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
