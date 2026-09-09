"use client";

import { useState, useTransition } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { toast } from "@camp404/ui/components/toast";
import { remindPendingAction } from "../../actions";

// The §7.4 nudge, on the surface that already knows who is outstanding.
//
// The outcome is reported TWICE on purpose. A toast is the right weight for
// "reminded 6 members" and the wrong weight for "nothing was sent, and here is
// why" — that one has to survive the five seconds a toast lives, or the captain
// reads a disappearing sentence and taps again. So the message is also written
// into a live region under the button and left there.
//
// `outstanding` is only ever CAPTION copy. The server decides who gets a
// reminder and whether one is due at all; this count came off a server render
// that may be minutes old, and disabling the button on it would let a stale
// number hide a working feature.
export function ReminderButton({
  activationId,
  outstanding,
}: {
  activationId: string;
  outstanding: number;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function remind() {
    startTransition(async () => {
      const result = await remindPendingAction(activationId);
      if (!result.ok) {
        setNote(null);
        toast.error(result.error);
        return;
      }
      setNote(result.message);
      if (result.sent > 0) toast.success(result.message);
      else toast.info(result.message);
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={remind}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <BellRing className="size-4" aria-hidden />
          )}
          Remind who hasn&rsquo;t answered
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {note ??
          (outstanding === 0
            ? "Everyone who was asked has answered."
            : `${outstanding} ${outstanding === 1 ? "member hasn't" : "members haven't"} answered yet. At most one reminder each per 24 hours.`)}
      </p>
    </div>
  );
}
