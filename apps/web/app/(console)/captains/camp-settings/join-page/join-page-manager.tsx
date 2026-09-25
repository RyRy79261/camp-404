"use client";

import { useState, useTransition } from "react";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { JoinPageBody } from "@camp404/ui/components/join-page-body";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { toast } from "@camp404/ui/components/toast";
import { CAMP_404_PALETTE } from "@camp404/ui/lib/landing-palette";
import { cn } from "@camp404/ui/lib/utils";
import { JoinPageEditor } from "@/components/join-page/join-page-editor";
import { saveJoinPageAction, unpublishJoinPageAction } from "./actions";

// The join page's editor in Camp settings (#264), laid out like the
// announcements composer: the text in the main column, what is live and the
// buttons that change it beside it. Save keeps a draft; Publish saves and puts
// the text on the join site; Take down removes it from the site and keeps the
// draft. A problem with a save shows beside the buttons, and a success is a
// toast, as every captain screen does it.

export interface JoinPageView {
  /** The burn year the page is for, or null when the camp has not set one. */
  year: number | null;
  draft: string;
  published: string | null;
  publishedAt: string | null;
  version: number;
  startedFrom: number | null;
}

const JOIN_SITE_URL = "https://join.camp-404.com";

const PUBLISHED_AT = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Johannesburg",
});

type Mode = "write" | "preview";

export function JoinPageManager({
  page,
  previewFontClass,
}: {
  page: JoinPageView;
  /** The public pages' face (Inter), so the preview reads as the site. */
  previewFontClass: string;
}) {
  const [markdown, setMarkdown] = useState(page.draft);
  const [saved, setSaved] = useState({
    draft: page.draft,
    published: page.published,
    publishedAt: page.publishedAt,
    version: page.version,
  });
  const [mode, setMode] = useState<Mode>("write");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [publishing, startPublish] = useTransition();
  const [unpublishing, startUnpublish] = useTransition();
  const [confirmDown, setConfirmDown] = useState(false);
  const [downError, setDownError] = useState<string | null>(null);
  const busy = saving || publishing || unpublishing;

  const unsaved = markdown !== saved.draft;
  const live = saved.published !== null;
  const liveIsCurrent = live && saved.published === markdown;
  const empty = markdown.trim() === "";

  function save(publish: boolean) {
    setError(null);
    const start = publish ? startPublish : startSave;
    start(async () => {
      const result = await saveJoinPageAction({
        markdown,
        expectedVersion: saved.version,
        publish,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved((s) => ({
        draft: markdown,
        published: publish ? markdown : s.published,
        publishedAt: publish ? new Date().toISOString() : s.publishedAt,
        version: result.data.version,
      }));
      toast.success(publish ? "Published to the join site" : "Draft saved");
    });
  }

  function takeDown() {
    setDownError(null);
    startUnpublish(async () => {
      const result = await unpublishJoinPageAction(saved.version);
      // A refusal shows in the dialog, beside the button that was pressed.
      if (!result.ok) {
        setDownError(result.error);
        return;
      }
      setConfirmDown(false);
      setSaved((s) => ({
        ...s,
        published: null,
        publishedAt: null,
        version: result.data.version,
      }));
      toast.success("Taken off the join site");
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">
              {page.year === null
                ? "This year's page"
                : `The page for ${page.year}`}
            </CardTitle>
            <CardDescription>
              Paste from Notion with Copy as Markdown, or type. Type / for
              headings, lists and pictures.
            </CardDescription>
          </div>
          <SegmentedControl
            aria-label="Write or preview"
            className="w-full sm:w-52"
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            options={[
              { value: "write", label: "Write" },
              { value: "preview", label: "Preview" },
            ]}
          />
        </CardHeader>
        <CardContent>
          {/* The editor stays mounted in preview, so its undo history and
              caret survive a look at the preview. */}
          <div className={cn(mode !== "write" && "hidden")}>
            <JoinPageEditor
              value={page.draft}
              onChange={setMarkdown}
              ariaLabel={
                page.year === null
                  ? "The join page for this year"
                  : `The join page for ${page.year}`
              }
            />
          </div>
          {mode === "preview" ? (
            <section
              aria-label="Preview"
              style={CAMP_404_PALETTE}
              className={cn(
                previewFontClass,
                "rounded-md bg-[color:var(--color-background)] px-5 py-6 text-[color:var(--color-foreground)] sm:px-8",
              )}
            >
              {empty ? (
                <p className="text-sm text-[color:var(--color-muted-foreground)]">
                  Nothing to preview yet.
                </p>
              ) : (
                <JoinPageBody markdown={markdown} />
              )}
            </section>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            On the join site
            {live ? (
              <Badge variant="success">Published</Badge>
            ) : (
              <Badge variant="outline">Not published</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {live
              ? liveIsCurrent
                ? "The join site shows this text."
                : "The join site shows the last text you published. Publish to put these changes on it."
              : "The join site shows no text for this year until you publish."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {saved.publishedAt ? (
            <p className="text-xs text-muted-foreground">
              Published {PUBLISHED_AT.format(new Date(saved.publishedAt))}
            </p>
          ) : null}
          {page.startedFrom !== null && saved.version === 0 ? (
            <Alert variant="info">
              <span>
                This year&apos;s page starts from {page.startedFrom}&apos;s
                text. Check anything that changes each year, like the dates,
                before you publish.
              </span>
            </Alert>
          ) : null}
          {unsaved ? (
            <p role="status" className="text-xs text-muted-foreground">
              You have changes that aren&apos;t saved.
            </p>
          ) : null}

          {error ? (
            <Alert variant="error">
              <TriangleAlert aria-hidden />
              <span>{error}</span>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => save(true)}
              disabled={busy || empty || liveIsCurrent}
            >
              {publishing ? "Publishing…" : "Publish"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => save(false)}
              disabled={busy || !unsaved}
            >
              {saving ? "Saving…" : "Save draft"}
            </Button>
            {live ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDownError(null);
                  setConfirmDown(true);
                }}
                disabled={busy}
              >
                Take off the join site
              </Button>
            ) : null}
          </div>

          <a
            href={JOIN_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent underline-offset-4 hover:underline"
          >
            Open join.camp-404.com
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDown}
        onOpenChange={setConfirmDown}
        title="Take the page off the join site?"
        description="People who visit join.camp-404.com will see that there is no page for this year. Your text stays here as a draft."
        confirmLabel="Take it off"
        onConfirm={takeDown}
        pending={unpublishing}
        error={downError}
      />
    </div>
  );
}
