"use client";

// WHAT A REPORT ATTACHES — shown before it is attached, not after.
//
// One component, rendered in the reporter dialog and again on the profile's
// "Bugs and feature requests" card. Ported from the AfrikaBurn contributors
// app's packages/ui/src/components/report-diagnostics.tsx, with Camp 404's own
// collector and its fuller error list kept. Two copies would drift, and this is
// the text somebody consents to.
//
// It renders the REAL payload — `collectDiagnostics()` runs here, on this page,
// and the rows below are the fields that would actually be sent. A generic "we
// collect some diagnostics" is not informed consent when the payload might
// carry the error that quoted somebody's phone number.
//
// Nothing here transmits. Building the object is local and cheap; the dialog
// builds its own when the member ticks the box, and sends exactly that.

import * as React from "react";
import { ChevronDown, Eye, TriangleAlert } from "lucide-react";
import { cn } from "@camp404/ui/lib/utils";
import {
  DIAGNOSTICS_LIMITS,
  type ReportDiagnostics,
} from "@/lib/github-feedback";
import { collectDiagnostics } from "@/lib/client-errors";

export interface ReportDiagnosticsPanelProps {
  /**
   * The snapshot to show. The dialog passes the one it captured when the box
   * was ticked, because that exact object is what it sends. Omit it and the
   * panel takes its own snapshot on mount — the profile card does, since
   * nothing is being filed there yet.
   */
  diagnostics?: ReportDiagnostics | null;
  /** Expanded on first render. The dialog opens it; the card starts closed. */
  defaultOpen?: boolean;
  /** Heading. The card says "What a bug report attaches" — nothing is being
   *  filed there, so "this" would have no referent. */
  title?: string;
  className?: string;
}

/**
 * Snapshot the diagnostics once per mount, in an effect rather than in render:
 * `collectDiagnostics()` reads `window` and `navigator`, and this renders
 * inside a server-rendered tree. Deliberately not recomputed as the page is
 * used — a panel whose contents shift under the reader is worse than one that
 * is a few pixels stale.
 */
function useOwnSnapshot(enabled: boolean): ReportDiagnostics | null {
  const [snapshot, setSnapshot] = React.useState<ReportDiagnostics | null>(
    null,
  );
  React.useEffect(() => {
    if (enabled) setSnapshot(collectDiagnostics());
  }, [enabled]);
  return snapshot;
}

export function ReportDiagnosticsPanel({
  diagnostics,
  defaultOpen = false,
  title = "What this attaches",
  className,
}: ReportDiagnosticsPanelProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const own = useOwnSnapshot(diagnostics === undefined);
  const shown = diagnostics ?? own;
  const fields = shown?.environment ?? [];
  const errors = shown?.errors ?? [];
  const bodyId = React.useId();

  return (
    <div
      className={cn("rounded-lg border border-border bg-background", className)}
    >
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <Eye className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold tracking-wider tabular-nums">
            {fields.length} {fields.length === 1 ? "FIELD" : "FIELDS"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>

      <div id={bodyId} hidden={!open} className="flex flex-col gap-2 px-3 pb-3">
        <p className="text-xs text-muted-foreground">
          This goes on a GitHub issue in the camp&rsquo;s tracker. Treat it as
          readable by anyone who can read that repository — the camp&rsquo;s own
          is a public one. Your name and email are never attached — only what
          you write, these facts about the device you&rsquo;re on, and your camp
          account id, which means nothing outside the camp but lets a captain
          work out who to follow up with.
        </p>

        {shown === null ? (
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            Reading them from this browser&hellip;
          </p>
        ) : (
          <dl className="flex flex-col gap-1 rounded-md bg-muted p-2 text-xs">
            {fields.map((field) => (
              <div key={field.label} className="flex gap-2">
                <dt className="w-20 shrink-0 font-semibold">{field.label}</dt>
                {/* `break-all`: a user-agent string has no spaces to wrap on
                    and would otherwise push the panel wider than the card. */}
                <dd className="min-w-0 flex-1 break-all font-mono">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {shown !== null &&
          (errors.length === 0 ? (
            <p className="text-xs">No recent errors in this tab.</p>
          ) : (
            <>
              <ul
                aria-label="Recent errors"
                className="flex flex-col gap-1 rounded-md bg-muted p-2 font-mono text-xs"
              >
                {errors.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="break-all">
                    {e.source}: {e.message}
                    {e.route ? ` (at ${e.route})` : ""}
                  </li>
                ))}
              </ul>
              <p className="flex gap-2 rounded-md bg-warning/10 p-2 text-xs leading-relaxed">
                <TriangleAlert
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                  aria-hidden
                />
                <span>
                  {errors.length} recent{" "}
                  {errors.length === 1 ? "error" : "errors"} from this tab{" "}
                  {errors.length === 1 ? "is" : "are"} attached — the last{" "}
                  {DIAGNOSTICS_LIMITS.errors} are kept, and they can quote
                  whatever was on screen when they happened.
                </span>
              </p>
            </>
          ))}

        {/* The two caveats that matter, and the one promise NOT made. */}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Paths only — never the query string, so invite codes and search terms
          stay out. Emails, phone and ID numbers in what you write are stripped
          before posting. That&rsquo;s pattern matching, not a guarantee:
          don&rsquo;t paste somebody else&rsquo;s details.
        </p>
      </div>
    </div>
  );
}
