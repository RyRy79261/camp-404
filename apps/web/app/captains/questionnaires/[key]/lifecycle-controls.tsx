"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CircleAlert,
  Loader2,
  Send,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Label } from "@camp404/ui/components/label";
import { Switch } from "@camp404/ui/components/switch";
import { toast } from "@camp404/ui/components/toast";
import {
  closeActivationAction,
  getCarryOverAction,
  publishAction,
  setCarryOverAction,
  unpublishAction,
} from "../actions";

type Status = "draft" | "published" | "unpublished";

/**
 * Footer Publish/Re-publish button. Captains only. On a publish-time validation
 * failure it surfaces the blocker list (validateBuilderQuestionnaire) in a dialog
 * instead of a terse toast, so the author can fix each one.
 */
export function PublishButton({
  questionnaireKey,
  status,
}: {
  questionnaireKey: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[] | null>(null);

  function publish() {
    startTransition(async () => {
      const result = await publishAction(questionnaireKey);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      toast.success(
        result.change === "cosmetic"
          ? "Updated the live version"
          : result.change === "breaking"
            ? `Published a new version (${result.version})`
            : "Published",
      );
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={publish} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {status === "draft" ? "Publish" : "Re-publish"}
      </Button>

      <Dialog
        open={errors !== null}
        onOpenChange={(open) => {
          if (!open) setErrors(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fix these before publishing</DialogTitle>
            <DialogDescription>
              A published questionnaire has to be complete and answerable.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {(errors ?? []).map((message, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <CircleAlert
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                />
                <span>{message}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Shown on the canvas while editing a published/unpublished questionnaire: head
 * edits don't reach members until the captain re-publishes (the live snapshot
 * keeps serving). Spec §4.2.
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
 * The bar loads the value itself rather than taking it as a prop, which keeps
 * the read beside the write and keeps a once-a-year setting off the builder
 * page's server render path.
 */
function CarryOverToggle({ questionnaireKey }: { questionnaireKey: string }) {
  const switchId = useId();
  const [askAgain, setAskAgain] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    void getCarryOverAction(questionnaireKey).then((result) => {
      if (live && result.ok) setAskAgain(!result.carryOver);
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
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <div className="flex items-center gap-3">
        <Label htmlFor={switchId} className="flex-1">
          Ask everyone again next year
        </Label>
        {askAgain === null && (
          <Loader2
            aria-hidden
            className="size-4 animate-spin text-muted-foreground"
          />
        )}
        <Switch
          id={switchId}
          checked={askAgain ?? false}
          disabled={pending || askAgain === null}
          onCheckedChange={change}
        />
      </div>
      <p className="text-caption text-muted-foreground">
        {askAgain === null
          ? "Checking this questionnaire’s setting…"
          : askAgain
            ? "When a captain starts a new year, this goes out again on a blank form. Everyone’s answers from previous years stay readable."
            : "When a captain starts a new year, nothing happens to this. Anyone who has answered stays answered."}
      </p>
    </div>
  );
}

const STATUS_BADGE: Record<
  Status,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  draft: { label: "Draft", variant: "outline" },
  published: { label: "Published", variant: "default" },
  unpublished: { label: "Unpublished", variant: "secondary" },
};

/**
 * Captain lifecycle bar: status, and the dispatch affordances for a published
 * questionnaire — Send to members (or close the current open send to re-send,
 * enforcing the one-open invariant) and Unpublish.
 */
export function LifecycleBar({
  questionnaireKey,
  status,
  version,
  openActivationId,
}: {
  questionnaireKey: string;
  status: Status;
  version: string | null;
  openActivationId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const badge = STATUS_BADGE[status];

  function unpublish() {
    if (
      !window.confirm(
        "Unpublish this questionnaire? Members will stop being able to answer it; their existing responses are kept.",
      )
    )
      return;
    startTransition(async () => {
      const result = await unpublishAction(questionnaireKey);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Unpublished");
      router.refresh();
    });
  }

  function closeSend() {
    if (!openActivationId) return;
    if (
      !window.confirm(
        "Close the current send? Members who haven't answered will no longer be asked. You can then send again with new settings.",
      )
    )
      return;
    startTransition(async () => {
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
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {status === "published" && version && (
          <span className="font-mono text-xs text-muted-foreground">
            {version}
          </span>
        )}
        {openActivationId && (
          <span className="ml-auto text-xs text-muted-foreground">
            Currently sent to members
          </span>
        )}
      </div>

      {status === "published" && (
        <div className="flex flex-wrap gap-2">
          {openActivationId ? (
            <Button
              type="button"
              variant="outline"
              onClick={closeSend}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Undo2 className="size-4" />
              )}
              Close send
            </Button>
          ) : (
            <Button asChild>
              <Link href={`/captains/questionnaires/${questionnaireKey}/send`}>
                <Send className="size-4" /> Send to members
              </Link>
            </Button>
          )}
          {/* The read-back half. Published is the right gate: a draft has no
              answers, so the page would render an empty state that reads as
              broken. Sits beside Send deliberately — sending and seeing what
              came back are the same job, ten minutes apart. */}
          <Button asChild variant="outline">
            <Link
              href={`/captains/questionnaires/${questionnaireKey}/metrics`}
            >
              <BarChart3 className="size-4" /> See results
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={unpublish}
            disabled={pending}
          >
            Unpublish
          </Button>
        </div>
      )}

      <CarryOverToggle questionnaireKey={questionnaireKey} />
    </Card>
  );
}
