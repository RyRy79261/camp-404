"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, ImageOff, Loader2, Trash2 } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import type { ReportScreenshotRow } from "@/lib/report-screenshots";
import { deleteReportScreenshotAction } from "./actions";

// The captains' list of bug-report screenshots (#313, mock-up rs-review):
// picture, report, who sent it, Open. Opening shows the whole picture with the
// report's words, a link to the issue, and Delete with a confirmation. Every
// picture here (the small one too) is fetched from /api/report-screenshot,
// which records the read. The whole list is marked `data-os-private`: a
// screenshot can show other members' details, so the desktop's last-seen copy
// of a background window never shows it.

const SECTION_LABEL =
  "font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground";

const timeFmt = new Intl.DateTimeFormat("en-ZA", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CAMP_TIME_ZONE,
});
const dayFmt = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: CAMP_TIME_ZONE });

/** "today 10:14" or "29 Sep". */
function when(date: Date, now = new Date()): string {
  return dayKey.format(date) === dayKey.format(now)
    ? `today ${timeFmt.format(date)}`
    : dayFmt.format(date);
}

/** "Issue #412 · today 10:14", or the date alone when it never reached GitHub. */
function meta(s: ReportScreenshotRow): string {
  const issue =
    s.issueNumber && s.issueNumber > 0 ? `Issue #${s.issueNumber}` : null;
  return [issue, when(new Date(s.filedAt))].filter(Boolean).join(" · ");
}

function pictureUrl(id: string, view: "list" | "open"): string {
  return `/api/report-screenshot/${encodeURIComponent(id)}${view === "list" ? "?view=list" : ""}`;
}

export function ReportScreenshotsList({
  screenshots,
}: {
  screenshots: ReportScreenshotRow[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [pending, startDelete] = useTransition();

  const shown = screenshots.filter((s) => !gone.has(s.id));

  function remove(id: string) {
    startDelete(async () => {
      const result = await deleteReportScreenshotAction(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setGone((g) => new Set(g).add(id));
      setOpenId(null);
      setConfirming(null);
      toast.success("Screenshot deleted");
      router.refresh();
    });
  }

  if (shown.length === 0) {
    return (
      <EmptyState
        icon={<ImageOff aria-hidden />}
        title="No screenshots."
        description="When a member attaches one to a bug report, it shows here."
        className="py-10"
      />
    );
  }

  return (
    <section
      aria-labelledby="report-screenshots-kept"
      className="flex flex-col gap-3"
      data-os-private
    >
      <h2 id="report-screenshots-kept" className="flex items-baseline gap-2">
        <span className={SECTION_LABEL}>Kept</span>
        <span className="text-sm text-muted-foreground">
          {shown.length} {shown.length === 1 ? "screenshot" : "screenshots"}
        </span>
      </h2>
      <div className="overflow-hidden border border-border bg-card">
        <div
          aria-hidden
          className="hidden grid-cols-[12rem_minmax(0,1fr)_minmax(0,12rem)_10rem] gap-4 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground md:grid"
        >
          <span>Picture</span>
          <span>Report</span>
          <span>From</span>
          <span className="text-right">Action</span>
        </div>
        <ul className="divide-y divide-border">
          {shown.map((s) => {
            const open = openId === s.id;
            const title = s.reportTitle ?? "Bug report";
            const from = s.fromName ?? "A member";
            return (
              <li key={s.id} aria-label={title}>
                <div
                  className={cn(
                    "grid items-center gap-3 px-4 py-3 md:grid-cols-[12rem_minmax(0,1fr)_minmax(0,12rem)_10rem] md:gap-4",
                    "max-md:grid-cols-[6rem_minmax(0,1fr)]",
                  )}
                >
                  {/* A private, audited route: never an optimised public
                      image. */}
                  <img
                    src={pictureUrl(s.id, "list")}
                    alt={`Screenshot for "${title}"`}
                    loading="lazy"
                    data-os-private
                    className={cn(
                      "aspect-[16/10] w-full border border-border bg-muted object-cover object-top",
                      open && "max-md:hidden",
                    )}
                  />
                  <div className={cn("min-w-0", open && "max-md:col-span-2")}>
                    <p className="font-semibold leading-snug [overflow-wrap:anywhere]">
                      {title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="md:hidden">{from} · </span>
                      {meta(s)}
                    </p>
                  </div>
                  <p className="hidden min-w-0 truncate md:block">{from}</p>
                  <div className="max-md:col-span-2 md:text-right">
                    <Button
                      type="button"
                      variant={open ? "outline" : "default"}
                      className="w-full"
                      aria-expanded={open}
                      onClick={() => {
                        setOpenId(open ? null : s.id);
                        setConfirming(null);
                      }}
                    >
                      {open ? "Close" : "Open"}
                    </Button>
                  </div>
                </div>

                {open && (
                  <div className="flex flex-col gap-4 border-t border-border bg-background/40 px-4 py-4">
                    <img
                      src={pictureUrl(s.id, "open")}
                      alt={`Screenshot for "${title}", full size`}
                      data-os-private
                      className="max-h-[70vh] w-full max-w-4xl border border-border object-contain object-left-top"
                    />
                    {s.reportText && (
                      <p className="whitespace-pre-wrap border-l-2 border-border pl-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                        {s.reportText}
                      </p>
                    )}
                    {confirming === s.id ? (
                      <div
                        role="group"
                        aria-label="Delete this screenshot?"
                        className="flex flex-col gap-3 border border-destructive/60 p-3 text-sm"
                      >
                        <p>
                          Delete this screenshot? It cannot be brought back. The
                          GitHub issue stays.
                        </p>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setConfirming(null)}
                            disabled={pending}
                          >
                            Keep it
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => remove(s.id)}
                            disabled={pending}
                          >
                            {pending ? (
                              <Loader2 className="animate-spin" aria-hidden />
                            ) : (
                              <Trash2 aria-hidden />
                            )}
                            Delete screenshot
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3 max-md:flex-col max-md:items-stretch">
                      {s.issueUrl && s.issueNumber && s.issueNumber > 0 ? (
                        <a
                          href={s.issueUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                        >
                          View issue #{s.issueNumber} on GitHub
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Not on GitHub.
                        </span>
                      )}
                      {confirming !== s.id && (
                        <Button
                          type="button"
                          variant="outline"
                          className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setConfirming(s.id)}
                          disabled={pending}
                        >
                          Delete screenshot
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
