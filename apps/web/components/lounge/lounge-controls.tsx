"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardCopy, Plus, Printer } from "lucide-react";
import { LOUNGE_POLICY_MAX, type LoungeOfferStatus } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Field } from "@camp404/ui/components/field";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  saveMusicPolicyAction,
  withdrawOfferAction,
} from "@/app/(console)/lounge/actions";
import { MarkdownField } from "@/components/markdown/markdown-field";
import {
  OfferDialog,
  type DayOption,
  type EditableOffer,
} from "./offer-dialog";

// The lounge's member controls (#269; redesign option A, owner 2026-10-01):
// Offer something, a host's Withdraw and Make changes in the fixed footer of
// their offer's card, the music note in the shared WYSIWYG Markdown editor,
// and the event guide's Copy. The offers table has its own controls
// (offers-table.tsx). A one-tap change reports its failure as a toast; a
// problem with what was typed shows inline in its dialog. The server re-checks
// every write regardless; nothing here is the boundary.

/** Any approved member: offer an activity or a DJ set. */
export function OfferButton({
  days,
  musicPolicy,
  variant = "default",
}: {
  days: readonly DayOption[];
  musicPolicy: string | null;
  /** The heading's is the page's main button; an empty list's is quieter. */
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = React.useState(false);
  const [round, setRound] = React.useState(0);
  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={() => {
          setRound((n) => n + 1);
          setOpen(true);
        }}
      >
        <Plus aria-hidden />
        Offer something
      </Button>
      <OfferDialog
        key={round}
        open={open}
        onOpenChange={setOpen}
        days={days}
        musicPolicy={musicPolicy}
      />
    </>
  );
}

/**
 * The footer of a host's own offer card: Withdraw on the left, the one main
 * button on the right (Make changes when the Ministry asked for changes,
 * Change while it waits), in the same two slots on every card.
 */
export function MyOfferActions({
  offer,
  status,
  placed,
  askedNote,
  days,
  musicPolicy,
}: {
  offer: EditableOffer;
  status: LoungeOfferStatus;
  placed: boolean;
  /** What the Ministry asked to change, shown at the top of the edit form. */
  askedNote: string | null;
  days: readonly DayOption[];
  musicPolicy: string | null;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [withdrawing, startWithdraw] = React.useTransition();
  const editable = status === "offered" || status === "needs_changes";

  function withdraw() {
    startWithdraw(async () => {
      const result = await withdrawOfferAction({ offerId: offer.id });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Offer withdrawn");
      router.refresh();
    });
  }

  return (
    <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3">
      <Button
        variant="outline"
        size="sm"
        className="w-full border-destructive/60 text-destructive"
        disabled={withdrawing}
        onClick={() => setConfirming(true)}
        aria-label={`Withdraw ${offer.title}`}
      >
        {withdrawing && <Spinner size="sm" label="Withdrawing…" />}
        Withdraw
      </Button>
      {editable ? (
        <Button
          variant={status === "needs_changes" ? "default" : "outline"}
          size="sm"
          className="w-full"
          disabled={withdrawing}
          onClick={() => setEditOpen(true)}
          aria-label={`${status === "needs_changes" ? "Make changes to" : "Change"} ${offer.title}`}
        >
          {status === "needs_changes" ? "Make changes" : "Change"}
        </Button>
      ) : (
        <span />
      )}
      {editable && (
        <OfferDialog
          key={`${offer.id}:${offer.version}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          editing={offer}
          askedNote={status === "needs_changes" ? askedNote : null}
          days={days}
          musicPolicy={musicPolicy}
        />
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Withdraw ${offer.title}?`}
        description={
          placed
            ? "It comes off the lounge programme, and the Ministry of Vibes won't see it any more."
            : "The Ministry of Vibes won't see it any more."
        }
        confirmLabel="Withdraw offer"
        destructive
        pending={withdrawing}
        onConfirm={withdraw}
      />
    </div>
  );
}

/**
 * The music note for DJs: write or change it, in the shared WYSIWYG Markdown
 * editor with its preview (owner, 2026-10-01: long text is never a raw
 * textarea). Stored as Markdown; a note written before as plain lines reads
 * the same, since the reader keeps line breaks.
 */
export function MusicNoteButton({
  policy,
  version,
}: {
  policy: string | null;
  version: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(policy ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const tooLong = text.length > LOUNGE_POLICY_MAX;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveMusicPolicyAction({
        musicPolicy: text,
        expectedVersion: version,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Music note saved");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setText(policy ?? "");
          setError(null);
          setOpen(true);
        }}
      >
        {policy ? "Edit" : "Write it"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-window-tint
          className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle>Music in the lounge</DialogTitle>
            <DialogDescription>
              What DJs should play. Everyone reads it, and a DJ sees it when
              they offer a set.
            </DialogDescription>
          </DialogHeader>
          <Field
            label="Music note"
            error={error}
            help={
              <span className={cn(tooLong && "text-destructive")}>
                {text.length} of {LOUNGE_POLICY_MAX} characters.
              </span>
            }
          >
            <MarkdownField
              label="Music note"
              value={text}
              onChange={setText}
              disabled={pending}
              emptyPreview="No music note yet."
            />
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || tooLong}>
              {pending && <Spinner size="sm" label="Saving…" />}
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Copies the event guide list as plain text. */
export function CopyGuideButton({ text }: { text: string }) {
  return (
    <Button
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("List copied");
        } catch {
          toast.error("Couldn't copy. Select the list and copy it instead.");
        }
      }}
    >
      <ClipboardCopy aria-hidden />
      Copy the list
    </Button>
  );
}

/** Opens the browser's print dialog; hidden on paper. */
export function PrintButton() {
  return (
    <Button className="print:hidden" onClick={() => window.print()}>
      <Printer aria-hidden />
      Print
    </Button>
  );
}
