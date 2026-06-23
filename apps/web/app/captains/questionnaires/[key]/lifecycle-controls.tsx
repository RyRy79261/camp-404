"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
import { toast } from "@camp404/ui/components/toast";
import {
  closeActivationAction,
  publishAction,
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
    </Card>
  );
}
