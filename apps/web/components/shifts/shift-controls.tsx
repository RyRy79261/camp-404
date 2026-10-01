"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Megaphone, Trash2 } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  askForShiftsAction,
  fillShiftDaysAction,
  leaveShiftAction,
  removeShiftTypeAction,
  signUpForShiftAction,
} from "@/app/(console)/shifts/actions";
import { shiftsAskedText } from "@/lib/shifts-copy";

// The roster's one-tap controls (#248). A one-tap change on a list row, so a
// failure is a toast and only the pressed control spins (AGENTS.md). The
// server re-checks every rule: who may act, the places left, and that the
// slot's day has not started.

type Result = { ok: true } | { ok: false; error: string };

/** A one-tap button that runs `act`, toasts a failure and refreshes. */
function OneTap({
  act,
  done,
  children,
  icon,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  act: () => Promise<Result>;
  done?: string;
  icon?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      type="button"
      size="sm"
      {...props}
      disabled={props.disabled || pending}
      onClick={() =>
        start(async () => {
          const result = await act();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          if (done) toast.success(done);
          router.refresh();
        })
      }
    >
      {pending ? <Spinner size="sm" label="Saving…" /> : icon}
      {children}
    </Button>
  );
}

/** Take a place, or leave the one you have. */
export function SignUpButton({
  slotId,
  mine,
  full,
  label,
}: {
  slotId: string;
  mine: boolean;
  full: boolean;
  /** The shift and day, for the button's accessible name. */
  label: string;
}) {
  if (mine) {
    return (
      <OneTap
        variant="outline"
        aria-label={`Leave ${label}`}
        act={() => leaveShiftAction({ slotId })}
      >
        Leave
      </OneTap>
    );
  }
  return (
    <OneTap
      aria-label={full ? `${label} is full` : `Sign up for ${label}`}
      disabled={full}
      act={() => signUpForShiftAction({ slotId })}
    >
      {full ? "Full" : "Sign up"}
    </OneTap>
  );
}

/** Give a shift the Burn days it has no slot for yet. */
export function FillDaysButton({
  typeId,
  missing,
  name,
}: {
  typeId: string;
  missing: number;
  name: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      aria-label={`Add the missing days to ${name}`}
      onClick={() =>
        start(async () => {
          const result = await fillShiftDaysAction({ typeId });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(
            `Added ${result.data.daysAdded} ${result.data.daysAdded === 1 ? "day" : "days"}.`,
          );
          router.refresh();
        })
      }
    >
      {pending ? (
        <Spinner size="sm" label="Adding…" />
      ) : (
        <CalendarPlus aria-hidden />
      )}
      Add {missing} missing {missing === 1 ? "day" : "days"}
    </Button>
  );
}

/** Remove a shift type nobody is on. */
export function RemoveShiftButton({
  id,
  version,
  name,
}: {
  id: string;
  version: number;
  name: string;
}) {
  return (
    <OneTap
      variant="ghost"
      aria-label={`Remove ${name}`}
      icon={<Trash2 aria-hidden />}
      done={`${name} removed`}
      act={() => removeShiftTypeAction({ id, expectedVersion: version })}
    >
      Remove
    </OneTap>
  );
}

/** "Ask everyone" who is coming and short of the minimum. A captain's. */
export function AskShifts() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      // On a phone it takes its own row, above My shifts and Print.
      className="basis-full page-sm:basis-auto"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await askForShiftsAction();
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(shiftsAskedText(res.data.asked, res.data.notified));
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Megaphone aria-hidden />
      )}
      Ask everyone
    </Button>
  );
}
