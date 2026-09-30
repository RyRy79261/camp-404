"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@camp404/ui/components/button";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  ATTENDANCE_ANSWERS,
  ATTENDANCE_ANSWER_LABELS,
  LOGISTICS_PHASE_LABELS,
  type AttendanceAnswer,
  type AttendancePhase,
} from "@camp404/types";
import { setMyAttendanceAction } from "@/app/(console)/logistics/actions";

// A member's own answer for one phase (#247 follow-up): Going, Maybe or
// Can't, one tap each. A one-tap change on a list row, so a failure is a toast
// and only the pressed button spins. Once the phase has started the buttons
// stay, disabled, with the reason beside them. The server re-checks both.

export function AttendancePicker({
  phase,
  answer,
  open,
}: {
  phase: AttendancePhase;
  /** The member's answer as the page read it; null before their first. */
  answer: AttendanceAnswer | null;
  /** False once the phase has started. */
  open: boolean;
}) {
  const router = useRouter();
  const label = LOGISTICS_PHASE_LABELS[phase];
  const [current, setCurrent] = React.useState(answer);
  const [pressed, setPressed] = React.useState<AttendanceAnswer | null>(null);
  const [pending, start] = React.useTransition();
  const closedId = `attendance-${phase}-closed`;

  function choose(next: AttendanceAnswer) {
    if (next === current || pending) return;
    setPressed(next);
    start(async () => {
      const result = await setMyAttendanceAction({
        phase,
        answer: next,
        expected: current,
      });
      setPressed(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCurrent(result.data.answer);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="group"
        aria-label={`Your answer for ${label}`}
        {...(open ? {} : { "aria-describedby": closedId })}
        className="flex flex-wrap gap-2"
      >
        {ATTENDANCE_ANSWERS.map((option) => {
          const on = option === current;
          return (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              aria-pressed={on}
              disabled={!open || pending}
              onClick={() => choose(option)}
            >
              {pending && pressed === option && (
                <Spinner size="sm" label="Saving…" />
              )}
              {ATTENDANCE_ANSWER_LABELS[option]}
            </Button>
          );
        })}
      </div>
      {!open && (
        <p id={closedId} className="text-xs text-muted-foreground">
          {label} has started, so answers are closed.
        </p>
      )}
    </div>
  );
}
