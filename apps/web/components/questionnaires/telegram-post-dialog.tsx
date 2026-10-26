"use client";

import { useId, useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import {
  TAG_GROUP_LABEL,
  TAG_GROUPS,
  tagCandidateStanding,
  tagGroupCount,
  tagGroupTicks,
  type TagGroup,
} from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { Checkbox } from "@camp404/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  postInTelegramAction,
  telegramPostDialogAction,
  type TelegramPostDialog,
} from "@/app/(console)/captains/questionnaires/actions";

// "Post in Telegram" on a sent questionnaire (owner's mock-up, 2026-10-27):
// Ol' Jeb posts it in the camp's chats, tagging the members its author or a
// captain picks. A chip ticks a group of who still owes it; each person can be
// ticked or unticked after. A member who connected Ol' Jeb starts unticked
// (they can get a private message instead); one with no Telegram username
// cannot be tagged. The server checks every pick again.

const LABEL =
  "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

export function TelegramPostButton({
  activationId,
  title,
}: {
  activationId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<TelegramPostDialog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  const openDialog = () => {
    setOpen(true);
    setDialog(null);
    setLoadError(null);
    startLoading(async () => {
      const result = await telegramPostDialogAction(activationId);
      if (result.ok) setDialog(result.dialog);
      else setLoadError(result.error);
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Post ${title} in Telegram`}
        onClick={openDialog}
      >
        <Send aria-hidden />
        Post in Telegram
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Post in Telegram</DialogTitle>
            <DialogDescription>
              Ol&apos; Jeb posts it in the camp&apos;s chats and tags the people
              you pick.
            </DialogDescription>
          </DialogHeader>
          {loading || (!dialog && !loadError) ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2
                aria-hidden
                className="size-4 motion-safe:animate-spin"
              />
              Loading who still has to answer…
            </p>
          ) : loadError ? (
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
          ) : dialog ? (
            <PostForm
              activationId={activationId}
              dialog={dialog}
              onDone={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PostForm({
  activationId,
  dialog,
  onDone,
}: {
  activationId: string;
  dialog: TelegramPostDialog;
  onDone: () => void;
}) {
  const { candidates, places } = dialog;
  const [group, setGroup] = useState<TagGroup | null>("pending");
  const [tagged, setTagged] = useState<Set<string>>(() =>
    tagGroupTicks(candidates, "pending"),
  );
  const [where, setWhere] = useState<Set<string>>(
    () => new Set(places.map((p) => p.id)),
  );
  const [messageConnected, setMessageConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posting, startPosting] = useTransition();
  const errorId = useId();
  const listId = useId();

  const pickGroup = (g: TagGroup) => {
    setGroup(g);
    setTagged(tagGroupTicks(candidates, g));
  };
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  const count = tagged.size;
  const post = () => {
    setError(null);
    startPosting(async () => {
      const result = await postInTelegramAction({
        activationId,
        tagUserIds: [...tagged],
        placeIds: [...where],
        messageConnected,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message);
      onDone();
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="flex flex-col gap-1.5">
        <p className={LABEL}>Message</p>
        <div className="rounded-md border p-3 text-sm">
          <p className="font-semibold">{dialog.title}</p>
          {dialog.body ? (
            <p className="mt-1 text-muted-foreground">{dialog.body}</p>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className={LABEL} id={`${listId}-who`}>
          Who to tag
        </p>
        <div
          role="group"
          aria-labelledby={`${listId}-who`}
          className="flex flex-wrap gap-2"
        >
          {TAG_GROUPS.map((g) => {
            const on = group === g;
            return (
              <button
                key={g}
                type="button"
                data-slot="filter-chip"
                aria-pressed={on}
                onClick={() => pickGroup(g)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on && "border-primary bg-primary/15",
                )}
              >
                {TAG_GROUP_LABEL[g]}{" "}
                {g === "nobody" ? null : (
                  <span
                    data-slot="filter-chip-count"
                    className="tabular-nums text-muted-foreground"
                  >
                    ({tagGroupCount(candidates, g)})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Everyone it was sent to has answered.
          </p>
        ) : (
          <ul
            aria-label="People who still have to answer"
            className="max-h-72 overflow-y-auto rounded-md border"
          >
            {candidates.map((c) => {
              const id = `${listId}-${c.userId}`;
              const taggable = c.mention !== null;
              return (
                <li
                  key={c.userId}
                  className={cn(
                    "flex min-h-11 items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0",
                    !taggable && "text-muted-foreground",
                  )}
                >
                  <Checkbox
                    id={id}
                    checked={tagged.has(c.userId)}
                    disabled={!taggable}
                    onCheckedChange={(v) => {
                      setGroup(null);
                      setTagged((s) => toggle(s, c.userId, v === true));
                    }}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <label htmlFor={id} className="min-w-0 truncate">
                        {c.name}
                      </label>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-accent">
                        {tagCandidateStanding(c)}
                      </span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground sm:ml-auto">
                      {c.connected
                        ? "connected · gets a DM"
                        : !taggable
                          ? "no Telegram username"
                          : c.mention}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <p className={LABEL}>Where</p>
        {places.map((p) => {
          const id = `${listId}-place-${p.id}`;
          return (
            <div key={p.id} className="flex items-center gap-3 text-sm">
              <Checkbox
                id={id}
                checked={where.has(p.id)}
                onCheckedChange={(v) =>
                  setWhere((s) => toggle(s, p.id, v === true))
                }
              />
              <label htmlFor={id}>
                {p.title}
                {p.topic ? (
                  <span className="text-muted-foreground"> · topic</span>
                ) : null}
              </label>
            </div>
          );
        })}
        <div className="flex items-center gap-3 text-sm">
          <Checkbox
            id={`${listId}-dm`}
            checked={messageConnected}
            onCheckedChange={(v) => setMessageConnected(v === true)}
          />
          <label htmlFor={`${listId}-dm`}>
            Also send a private message to members who connected Telegram
          </label>
        </div>
      </section>

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          variant="outline"
          onClick={onDone}
          disabled={posting}
          type="button"
        >
          Cancel
        </Button>
        <Button
          onClick={post}
          disabled={posting || where.size === 0}
          aria-describedby={error ? errorId : undefined}
        >
          {posting ? (
            <Loader2 aria-hidden className="motion-safe:animate-spin" />
          ) : null}
          Post now · tags {count === 1 ? "1 person" : `${count} people`}
        </Button>
      </DialogFooter>
    </div>
  );
}
