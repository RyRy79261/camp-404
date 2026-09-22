"use client";

// "Bugs and feature requests" — the reporter's entry on the profile page.
// Ported from the AfrikaBurn contributors app's
// packages/ui/src/components/report-settings-card.tsx, wired to Camp 404's own
// reporter and its own diagnostics.
//
// It exists for the question you cannot ask by shaking your phone: *what does
// this send?* Answering that only inside the dialog means the only way to read
// the disclosure is to start a report, which is backwards — so the same panel
// is here, collapsed, reachable without filing anything.
//
// Every claim below is read off the code that files the issue
// (lib/github-feedback.ts, app/feedback/actions.ts, lib/client-errors.ts). If
// one of them changes, this changes with it.

import * as React from "react";
import { Bug, Info, Lightbulb, PlugZap } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { cn } from "@camp404/ui/lib/utils";
import type { FeedbackKind } from "@/lib/github-feedback";
import { openReportProblem } from "./report-problem";
import { ReportDiagnosticsPanel } from "./report-diagnostics";

export interface ReportSettingsCardProps {
  /**
   * False when the deployment has no `GITHUB_FEEDBACK_TOKEN`, or its
   * `GITHUB_FEEDBACK_REPO` is malformed. The two buttons are replaced by a
   * plain statement: there is nowhere for a report to go, and the honest place
   * to say so is the page somebody opens to ask why reporting does nothing.
   */
  filingEnabled?: boolean;
  /** `owner/name` of the tracker reports land on, when it is configured. */
  repo?: string | null;
  /** True when the server has an ANTHROPIC_API_KEY, so the AI pass can run. */
  aiAvailable?: boolean;
}

export function ReportSettingsCard({
  filingEnabled = true,
  repo = null,
  aiAvailable = false,
}: ReportSettingsCardProps = {}) {
  function start(kind: FeedbackKind) {
    openReportProblem({ kind });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bugs and feature requests</CardTitle>
        <CardDescription>
          {filingEnabled
            ? "Start one here — or, on a phone, shake it on any screen to open the same reporter."
            : "How reports work here, and what one would send."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!filingEnabled && (
          <p className="flex gap-2.5 rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
            <PlugZap
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span>
              <span className="font-semibold">
                Reporting isn&rsquo;t switched on for this deployment.
              </span>{" "}
              The reporter still opens — shaking your phone still works — but
              sending will come back with &ldquo;Feedback isn&rsquo;t set up
              yet.&rdquo; Everything below still describes what a report would
              attach once it is.
            </span>
          </p>
        )}

        {/* Stacked, not side by side: this card sits in the profile's narrow
            side column, where two cards abreast would wrap mid-word.
            Not rendered at all when filing is off, rather than AfrikaBurn's
            `hidden` class — a button that is only CSS-hidden is one stylesheet
            failure away from being pressable, and it would file nothing. */}
        {filingEnabled && (
          <div className="flex flex-col gap-3">
            {(
              [
                {
                  kind: "bug" as const,
                  title: "Report a bug",
                  description: "Something is broken or behaving oddly.",
                  Icon: Bug,
                  tint: "text-primary",
                },
                {
                  kind: "feature" as const,
                  title: "Request a feature",
                  description: "Something is missing or could work better.",
                  Icon: Lightbulb,
                  tint: "text-accent",
                },
              ] as const
            ).map(({ kind, title, description, Icon, tint }) => (
              <button
                key={kind}
                type="button"
                onClick={() => start(kind)}
                className="flex items-center gap-3 rounded-lg border border-input p-3 text-left transition-colors hover:border-muted-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className={cn("h-4 w-4 shrink-0", tint)} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-foreground">
                    {title}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <ReportDiagnosticsPanel title="What a bug report attaches" />

        <p className="flex gap-2.5 rounded-md bg-primary/10 p-3 text-xs leading-relaxed">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>
            A report becomes a GitHub issue on{" "}
            <span className="font-mono">{repo ?? "the camp's tracker"}</span>,
            filed by the camp&rsquo;s GitHub account rather than yours, and
            labelled <span className="font-mono">needs-triage</span>. The camp
            repo is public, so anyone can read it. Nothing is kept in Camp
            404&rsquo;s own database. Your name and email are never in the
            issue; your camp account id is, so a captain can work out who to ask
            — but nobody is notified, and nobody is watching it on your behalf.
            {aiAvailable ? (
              <>
                {" "}
                With &ldquo;Improve with AI&rdquo; left ticked, the stripped
                text of your report is sent to Claude first, to be rewritten as
                a title and steps — unless it reads as though it holds somebody
                else&rsquo;s details, which holds the whole report for a person
                instead.
              </>
            ) : null}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
