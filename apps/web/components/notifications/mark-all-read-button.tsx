"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import { markAllNotificationsReadAction } from "@/app/(console)/notifications/actions";

// "Mark all read" — own inbox only (the action resolves the member itself and
// pins the UPDATE to them). A one-tap control on the panel's header row, so a
// failure is a toast and only this control spins.
//
// It does NOT latch itself off after a press: `disabled` is driven by the
// panel's fresh unread count, which `onDone` re-reads, so a delivery that lands
// between the press and the refetch still finds the control live.

export function MarkAllReadButton({
  disabled,
  className,
  onDone,
}: {
  disabled?: boolean;
  className?: string;
  /** Fired after a successful clear, so the panel can refetch its rows. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsReadAction();
          if (!result.ok) {
            toast.error("Couldn't mark them read", {
              description: result.error,
            });
            return;
          }
          onDone?.();
          router.refresh();
        })
      }
    >
      {pending ? (
        <Spinner size="sm" label="Marking read…" />
      ) : (
        <CheckCheck className="h-4 w-4" aria-hidden />
      )}
      Mark all read
    </Button>
  );
}
