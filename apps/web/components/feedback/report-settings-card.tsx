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
import { FEEDBACK_UNAVAILABLE_MESSAGE } from "@/lib/integration-config";
import { openReportProblem } from "./report-problem";
import { ReportDiagnosticsPanel } from "./report-diagnostics";

export interface ReportSettingsCardProps {
  /**
   * Why a report has nowhere to go, or `"ok"`. The two reasons say different
   * things to the member and need different fixes from a captain, so the card
   * carries the reason rather than a bare boolean: it quotes the message the
   * send would ACTUALLY come back with, straight from the constant the server
   * action returns.
   */
  filing?: "ok" | "no_token" | "bad_repo";
  /** `owner/name` of the tracker reports land on, when it is configured. */
  repo?: string | null;
  /** True when the server has an ANTHROPIC_API_KEY, so the AI pass can run. */
  aiAvailable?: boolean;
}

export function ReportSettingsCard({
  filing = "ok",
  repo = null,
  aiAvailable = false,
}: ReportSettingsCardProps = {}) {
  const filingEnabled = filing === "ok";
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
                {filing === "bad_repo"
                  ? "Reporting is switched on but pointed at nothing."
                  : "Reporting isn’t switched on for this deployment."}
              </span>{" "}
              The reporter still opens — shaking your phone still works — but
              sending comes back with{" "}
              <span className="italic">
                &ldquo;
                {filing === "bad_repo"
                  ? FEEDBACK_UNAVAILABLE_MESSAGE.bad_repo
                  : FEEDBACK_UNAVAILABLE_MESSAGE.no_token}
                &rdquo;
              </span>{" "}
              {filing === "bad_repo"
                ? "— the tracker setting is not in owner/name form, which is the thing to tell a captain."
                : "— there is no GitHub token set, which is the thing to tell a captain."}{" "}
              Everything below still describes what a report would attach once
              it is fixed.
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
            labelled <span className="font-mono">needs-triage</span>. Anyone who
            can read that repository can read your report, and the camp&rsquo;s
            own is a public one. Nothing is kept in Camp 404&rsquo;s own
            database. Your name and email are never in the issue; your camp
            account id is, so a captain can work out who to ask — but nobody is
            notified, and nobody is watching it on your behalf.
            {aiAvailable ? (
              <>
                {" "}
                With &ldquo;Improve with AI&rdquo; left ticked, the stripped
                text of your report is sent to Claude first, to be rewritten as
                a title and steps. That step is skipped if your report speaks to
                whoever reads it, asks for data to be sent on, or looks like it
                holds somebody else&rsquo;s details: the issue is then filed as
                you wrote it, labelled{" "}
                <span className="font-mono">needs-human</span> for a person to
                read. It is still filed straight away — nothing is held back and
                waited on. In the last case the device details are left off it
                too.
              </>
            ) : null}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
