"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Loader2, Send, TriangleAlert, Undo2 } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Switch } from "@camp404/ui/components/switch";
import { toast } from "@camp404/ui/components/toast";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { BlockingBadge } from "@/components/questionnaire/blocking-chrome";
import {
  closeActivationAction,
  getCarryOverAction,
  setCarryOverAction,
  unpublishAction,
} from "../actions";

type Status = "draft" | "published" | "unpublished";

// The builder's right rail. AfrikaBurn's builder has an "Audience & send" card
// there; Camp 404 publishes first and chooses the audience on the Send page, so
// the same card holds this questionnaire's lifecycle instead: its status,
// Publish, Send, Close send, See results, Unpublish and the year policy.
// Publishing, closing, unpublishing, results and the year policy are
// captain-only, and each action checks that again on the server; a team lead
// sees the status, Send, and why Publish is out of reach.

/**
 * Shown while editing a published/unpublished questionnaire: head edits don't
 * reach members until a captain re-publishes (the live snapshot keeps serving).
 * Spec §4.2.
 */
export function EditPublishedBanner({ status }: { status: Status }) {
  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden />
      <span>
        {status === "published"
          ? "You're editing a live questionnaire. Members keep the current version until you re-publish."
          : "This questionnaire is unpublished. Edits are saved as a draft; re-publish to put it back online."}
      </span>
    </Alert>
  );
}

/**
 * The year policy, in the captain's words rather than the schema's: "ask
 * everyone again next year". On the column it is `carry_over` — inverted here
 * because the thing a captain is deciding is whether the questionnaire goes
 * back out, not whether an answer survives.
 *
 * Flipping it needs no re-publish (that is why it is a column, not a field in
 * the definition JSON) and it never disturbs a send already in flight: the
 * activation carries a frozen copy, and a member halfway through a form keeps
 * the rules they started under.
 *
 * The rail loads the value itself rather than taking it as a prop, which keeps
 * the read beside the write and keeps a once-a-year setting off the builder
 * page's server render path.
 */
export function CarryOverToggle({
  questionnaireKey,
}: {
  questionnaireKey: string;
}) {
  const switchId = useId();
  const hintId = useId();
  const [askAgain, setAskAgain] = useState<boolean | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    getCarryOverAction(questionnaireKey)
      .then((result) => {
        if (!live) return;
        if (result.ok) setAskAgain(!result.carryOver);
        else setUnreadable(true);
      })
      .catch(() => {
        if (live) setUnreadable(true);
      });
    return () => {
      live = false;
    };
  }, [questionnaireKey]);

  // No optimistic flip — the server stays the truth, as everywhere else in the
  // captain surfaces. The switch is disabled until the read lands.
  function change(next: boolean) {
    startTransition(async () => {
      const result = await setCarryOverAction(questionnaireKey, !next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAskAgain(next);
      toast.success(
        next
          ? "Everyone will be asked this again next year"
          : "Answers will stay as they are next year",
      );
    });
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-4">
      <div className="flex items-start justify-between gap-4">
        <label htmlFor={switchId} className="text-sm font-medium">
          Ask everyone again next year
        </label>
        <div className="flex items-center gap-2">
          {(askAgain === null && !unreadable) || pending ? (
            <Loader2
              aria-hidden
              className="size-4 text-muted-foreground motion-safe:animate-spin"
            />
          ) : null}
          <Switch
            id={switchId}
            checked={askAgain ?? false}
            disabled={pending || askAgain === null}
            aria-describedby={hintId}
            onCheckedChange={change}
          />
        </div>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {askAgain === null
          ? unreadable
            ? "This setting couldn’t be loaded. Reload the page to try again."
            : "Checking this questionnaire’s setting…"
          : askAgain
            ? "When a captain starts a new year, this goes out again on a blank form. Everyone’s answers from previous years stay readable."
            : "When a captain starts a new year, nothing happens to this. Anyone who has answered stays answered."}
      </p>
    </div>
  );
}

const STATUS_BADGE: Record<
  Status,
  { label: string; variant: "success" | "secondary" | "outline" }
> = {
  draft: { label: "Draft", variant: "outline" },
  published: { label: "Published", variant: "success" },
  unpublished: { label: "Unpublished", variant: "secondary" },
};

/** The question before closing an open send, wherever a captain can close one. */
export const CLOSE_SEND_CONFIRM = {
  title: "Close the current send?",
  description:
    "Members who haven't answered stop being asked. Answers already in are kept, and you can send again with new settings.",
  confirmLabel: "Close send",
} as const;

/**
 * The lifecycle card: status; Publish (or Re-publish); for a published
 * questionnaire Send (or Close send while one is open), See results and
 * Unpublish; and the year policy. `onPublish` belongs to the builder, which
 * saves unsaved changes first and shows what publishing refused beside the
 * blocks it is about.
 */
export function LifecycleRail({
  questionnaireKey,
  status,
  version,
  isCaptain,
  openActivationId,
  openActivationBlocking = null,
  publishing,
  unsaved,
  onPublish,
}: {
  questionnaireKey: string;
  status: Status;
  version: string | null;
  /** Captains publish, close, unpublish and set the year policy. */
  isCaptain: boolean;
  openActivationId: string | null;
  /** The open send's blocking flag, shown beside "Currently sent". */
  openActivationBlocking?: boolean | null;
  publishing: boolean;
  /** The builder holds changes that are not saved yet. */
  unsaved: boolean;
  onPublish: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"unpublish" | "close" | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const reasonId = useId();
  const badge = STATUS_BADGE[status];

  async function unpublish() {
    const sure = await confirm({
      title: "Unpublish this questionnaire?",
      description:
        "Members stop being able to answer it, and any open send closes. Their answers so far are kept.",
      confirmLabel: "Unpublish",
      destructive: true,
    });
    if (!sure) return;
    setBusy("unpublish");
    try {
      const result = await unpublishAction(questionnaireKey);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Unpublished");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function closeSend() {
    if (!openActivationId) return;
    const sure = await confirm(CLOSE_SEND_CONFIRM);
    if (!sure) return;
    setBusy("close");
    try {
      const result = await closeActivationAction(
        openActivationId,
        questionnaireKey,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Send closed");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const anyBusy = publishing || busy !== null;

  return (
    <aside
      aria-label="Publish and send"
      className="flex flex-col gap-4 page-xl:sticky page-xl:top-32 page-xl:self-start"
    >
      {confirmDialog}
      <Card>
        <CardHeader>
          <CardTitle>Publish &amp; send</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {status !== "draft" && version ? (
              <span className="font-mono text-xs text-muted-foreground">
                {version}
              </span>
            ) : null}
          </div>
          {openActivationId ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              Currently sent to members
              {openActivationBlocking !== null ? (
                <BlockingBadge blocking={openActivationBlocking} />
              ) : null}
            </div>
          ) : null}

          {status !== "draft" ? <EditPublishedBanner status={status} /> : null}

          <div className="flex flex-col gap-1.5">
            {isCaptain ? (
              <>
                <Button
                  type="button"
                  onClick={onPublish}
                  disabled={anyBusy}
                  aria-describedby={unsaved ? reasonId : undefined}
                >
                  {publishing ? (
                    <Loader2
                      aria-hidden
                      className="size-4 motion-safe:animate-spin"
                    />
                  ) : null}
                  {status === "draft" ? "Publish" : "Re-publish"}
                </Button>
                {unsaved ? (
                  <span id={reasonId} className="text-xs text-muted-foreground">
                    Your unsaved changes are saved first.
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <Button type="button" disabled aria-describedby={reasonId}>
                  {status === "draft" ? "Publish" : "Re-publish"}
                </Button>
                <span id={reasonId} className="text-xs text-muted-foreground">
                  Only captains can publish. Save your draft, then ask a captain
                  to publish it.
                </span>
              </>
            )}
          </div>

          {status === "published" || (isCaptain && status !== "draft") ? (
            <div className="flex flex-col gap-2">
              {status === "published" ? (
                isCaptain && openActivationId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void closeSend()}
                    disabled={anyBusy}
                  >
                    {busy === "close" ? (
                      <Loader2
                        aria-hidden
                        className="size-4 motion-safe:animate-spin"
                      />
                    ) : (
                      <Undo2 aria-hidden className="size-4" />
                    )}
                    Close send
                  </Button>
                ) : (
                  <Button asChild variant="outline">
                    <Link
                      href={`/captains/questionnaires/${questionnaireKey}/send`}
                    >
                      <Send aria-hidden className="size-4" /> Send to members
                    </Link>
                  </Button>
                )
              ) : null}
              {/* The read-back half. A draft has no answers, so the page would
                  render an empty state that reads as broken. Results are
                  captain-only. */}
              {isCaptain ? (
                <Button asChild variant="outline">
                  <Link
                    href={`/captains/questionnaires/${questionnaireKey}/metrics`}
                  >
                    <BarChart3 aria-hidden className="size-4" /> See results
                  </Link>
                </Button>
              ) : null}
              {isCaptain && status === "published" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void unpublish()}
                  disabled={anyBusy}
                >
                  {busy === "unpublish" ? (
                    <Loader2
                      aria-hidden
                      className="size-4 motion-safe:animate-spin"
                    />
                  ) : null}
                  Unpublish
                </Button>
              ) : null}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Publishing puts this version online. Sending asks members to answer
            it, on the Send page.
          </p>

          {isCaptain ? (
            <CarryOverToggle questionnaireKey={questionnaireKey} />
          ) : null}
        </CardContent>
      </Card>
    </aside>
  );
}
