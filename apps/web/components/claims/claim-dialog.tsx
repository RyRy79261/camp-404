"use client";

import { useState } from "react";
import { ReceiptText } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@camp404/ui/components/dialog";
import { CLAIM_ON_SITE_NOTE } from "@/lib/claims-copy";
import { ClaimForm } from "./claim-form";

// "Claim money back" (#242): the reason a member opens My claims, so it is
// the page's one main button at the top, never below a year of history. It
// opens the form in a dialog (AfrikaBurn's add-and-edit composition); on a
// phone the dialog fills the screen. Sending closes it, and the new claim is
// the first row of the list.

export function ClaimDialog({
  teams,
  defaultTeam,
  today,
}: {
  teams: { key: string; label: string }[];
  defaultTeam: string | null;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  // A send on its way keeps the dialog open: closing it would unmount the
  // form, and a refusal from the server would then show nowhere.
  const [sending, setSending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || !sending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <ReceiptText aria-hidden />
          Claim money back
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!sending}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:max-w-full max-sm:rounded-none max-sm:border-0"
      >
        <DialogHeader>
          <DialogTitle>Claim money back</DialogTitle>
          <DialogDescription>
            For something you bought for a team. A claim needs at least one
            receipt. {CLAIM_ON_SITE_NOTE}
          </DialogDescription>
        </DialogHeader>
        <ClaimForm
          teams={teams}
          defaultTeam={defaultTeam}
          today={today}
          onSent={() => {
            setSending(false);
            setOpen(false);
          }}
          onPendingChange={setSending}
        />
      </DialogContent>
    </Dialog>
  );
}
