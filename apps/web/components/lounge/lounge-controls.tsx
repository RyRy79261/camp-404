"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardCopy, Plus, Printer } from "lucide-react";
import type { LoungeOfferStatus } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import { withdrawOfferAction } from "@/app/(console)/lounge/actions";
import {
  OfferDialog,
  type DayOption,
  type EditableOffer,
} from "./offer-dialog";

// The lounge's member controls (#269; redesign option A, owner 2026-10-01):
// Offer something, a host's Withdraw and Make changes in the fixed footer of
// their offer's card, and the event guide's Copy. The music note's editor is
// in its own module (music-note-button.tsx), so a member who never opens it
// does not download the WYSIWYG editor with these buttons. The offers table has its own controls
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
