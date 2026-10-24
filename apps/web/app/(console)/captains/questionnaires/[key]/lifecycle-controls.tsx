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
  setAnonymousResultsAction,
  setCarryOverAction,
  unpublishAction,
} from "../actions";

type Status = "draft" | "published" | "unpublished";

// The builder's right rail: this questionnaire's life. Sending is the one step
// (owner, 2026-10-23: "Publish means send"): "Send…" opens the Send page, and
// sending there puts the latest version online and asks the people picked.
// While a send is out, "Send changes" puts edits online and "Close send" ends
// it. Everyone who can open the builder (its author, or a captain) does these;
// each action checks that again on the server. Unpublishing and the year
// policy stay with captains.

/**
 * Shown while editing a published/unpublished questionnaire: head edits don't
 * reach members until they are sent (the live snapshot keeps serving).
 * Spec §4.2.
 */
export function EditPublishedBanner({
  status,
  sentNow,
}: {
  status: Status;
  sentNow: boolean;
}) {
  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden />
      <span>
        {status === "unpublished"
          ? "This questionnaire was taken offline. Send it to put it back online with your latest edits."
          : sentNow
            ? "You're editing a questionnaire that is out with members. They keep the version they have until you send your changes."
            : "No send is open. Your edits go online the next time you send it."}
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

/** Where a questionnaire stands, in the words the camp uses. */
export function lifecycleLabel(
  status: Status,
  sentNow: boolean,
): { label: string; variant: "success" | "secondary" | "outline" } {
  if (status === "draft") return { label: "Draft", variant: "outline" };
  if (status === "unpublished")
    return { label: "Offline", variant: "secondary" };
  return sentNow
    ? { label: "Sent", variant: "success" }
    : { label: "Closed", variant: "secondary" };
}

/** The question before closing an open send, wherever a captain can close one. */
export const CLOSE_SEND_CONFIRM = {
  title: "Close the current send?",
  description:
    "Members who haven't answered stop being asked. Answers already in are kept, and you can send again with new settings.",
  confirmLabel: "Close send",
} as const;

/** The same question for an optional questionnaire (#313), which asked nobody. */
export const CLOSE_OPT_IN_CONFIRM = {
  title: "Close the current send?",
  description:
    "It leaves Optional in every member's My forms. Answers already in are kept, and you can send it again.",
  confirmLabel: "Close send",
} as const;

/**
 * The Send card: where it stands; Send… (or, while a send is out, Send changes
 * and Close send); its results; Unpublish (captains); whether the results
 * show names; and the year policy (captains). `onSend` and `onSendChanges`
 * belong to the builder, which checks and saves the draft first and shows
 * what stops it beside the blocks it is about.
 */
export function LifecycleRail({
  questionnaireKey,
  status,
  version,
  isCaptain,
  openActivationId,
  openActivationBlocking = null,
  anonymousResults,
  busy: builderBusy,
  unsaved,
  onSend,
  onSendChanges,
}: {
  questionnaireKey: string;
  status: Status;
  version: string | null;
  /** Captains also unpublish, read every name, and set the year policy. */
  isCaptain: boolean;
  openActivationId: string | null;
  /** The open send's blocking flag, shown beside "Out with members". */
  openActivationBlocking?: boolean | null;
  /** The members who answered read the results without names. */
  anonymousResults: boolean;
  /** The builder is checking, saving or sending changes. */
  busy: "send" | "changes" | null;
  /** The builder holds changes that are not saved yet. */
  unsaved: boolean;
  onSend: () => void;
  onSendChanges: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"unpublish" | "close" | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const reasonId = useId();
  const sentNow = status === "published" && openActivationId !== null;
  const badge = lifecycleLabel(status, sentNow);

  async function unpublish() {
    const sure = await confirm({
      title: "Take this questionnaire offline?",
      description:
        "Members stop being able to answer it, and any open send closes. Their answers so far are kept.",
      confirmLabel: "Take offline",
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
      toast.success("Taken offline");
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

  const anyBusy = builderBusy !== null || busy !== null;
  const spinner = (
    <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
  );

  return (
    // In the builder's grid: under the questionnaire while the page has two
    // columns (never under the palette, which sticks down its column and
    // would cover it), its own third column from xl.
    <aside
      aria-label="Send"
      className="flex flex-col gap-4 page-lg:col-start-2 page-xl:sticky page-xl:top-6 page-xl:col-start-3 page-xl:row-start-1 page-xl:self-start"
    >
      {confirmDialog}
      <Card>
        <CardHeader>
          <CardTitle>Send</CardTitle>
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
          {sentNow ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              Out with members now
              {openActivationBlocking !== null ? (
                <BlockingBadge blocking={openActivationBlocking} />
              ) : null}
            </div>
          ) : null}

          {status !== "draft" ? (
            <EditPublishedBanner status={status} sentNow={sentNow} />
          ) : null}

          <div className="flex flex-col gap-2">
            {sentNow ? (
              <>
                <Button
                  type="button"
                  onClick={onSendChanges}
                  disabled={anyBusy}
                  aria-describedby={reasonId}
                >
                  {builderBusy === "changes" ? (
                    spinner
                  ) : (
                    <Send aria-hidden className="size-4" />
                  )}
                  Send changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void closeSend()}
                  disabled={anyBusy}
                >
                  {busy === "close" ? (
                    spinner
                  ) : (
                    <Undo2 aria-hidden className="size-4" />
                  )}
                  Close send
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={onSend}
                disabled={anyBusy}
                aria-describedby={reasonId}
              >
                {builderBusy === "send" ? (
                  spinner
                ) : (
                  <Send aria-hidden className="size-4" />
                )}
                Send…
              </Button>
            )}
            <span id={reasonId} className="text-xs text-muted-foreground">
              {sentNow
                ? "Send changes puts your edits in front of the people already asked."
                : "You pick who answers next. Sending puts it online and asks them in one step."}
              {unsaved ? " Your unsaved changes are saved first." : null}
            </span>
          </div>

          {status !== "draft" ? (
            <div className="flex flex-col gap-2">
              {/* A draft has no answers, so a results page would read as
                  broken. A captain reads the full results with names; the
                  author reads what the members who answered read. */}
              <Button asChild variant="outline">
                <Link
                  href={
                    isCaptain
                      ? `/captains/questionnaires/${questionnaireKey}/metrics`
                      : `/questionnaires/results/${questionnaireKey}`
                  }
                >
                  <BarChart3 aria-hidden className="size-4" /> See results
                </Link>
              </Button>
              {isCaptain && status === "published" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void unpublish()}
                  disabled={anyBusy}
                >
                  {busy === "unpublish" ? spinner : null}
                  Take offline
                </Button>
              ) : null}
            </div>
          ) : null}

          <AnonymousResultsToggle
            questionnaireKey={questionnaireKey}
            initial={anonymousResults}
          />

          {isCaptain ? (
            <CarryOverToggle questionnaireKey={questionnaireKey} />
          ) : null}
        </CardContent>
      </Card>
    </aside>
  );
}

/**
 * Whether the members who answered see names in the results (owner,
 * 2026-10-23: names by default, anonymous when the author asks). Captains
 * always see names. No optimistic flip: the server stays the truth.
 */
export function AnonymousResultsToggle({
  questionnaireKey,
  initial,
}: {
  questionnaireKey: string;
  initial: boolean;
}) {
  const switchId = useId();
  const hintId = useId();
  const [anonymous, setAnonymous] = useState(initial);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    startTransition(async () => {
      const result = await setAnonymousResultsAction(questionnaireKey, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAnonymous(next);
      toast.success(
        next ? "Results will show no names" : "Results will show names",
      );
    });
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-4">
      <div className="flex items-start justify-between gap-4">
        <label htmlFor={switchId} className="text-sm font-medium">
          Anonymous results
        </label>
        <div className="flex items-center gap-2">
          {pending ? (
            <Loader2
              aria-hidden
              className="size-4 text-muted-foreground motion-safe:animate-spin"
            />
          ) : null}
          <Switch
            id={switchId}
            checked={anonymous}
            disabled={pending}
            aria-describedby={hintId}
            onCheckedChange={change}
          />
        </div>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {anonymous
          ? "People who answered see the counts and the written answers, with no names. Captains still see names."
          : "People who answered see the counts first, then who answered what."}
      </p>
    </div>
  );
}
