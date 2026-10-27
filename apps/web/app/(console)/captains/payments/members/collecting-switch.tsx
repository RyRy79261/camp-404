"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Switch } from "@camp404/ui/components/switch";
import { toast } from "@camp404/ui/components/toast";
import { setCollectingFeesAction } from "../camp-money-actions";

// "Collecting fees" (mock-up step 2): while on, a member who owes sees how to
// pay and the Finance team can send reminders. A one-tap change: a failure is
// a toast, and the write is a compare-and-set on the year the page read.

export function CollectingSwitch({
  on,
  version,
}: {
  on: boolean;
  version: number;
}) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();

  function flip(next: boolean) {
    start(async () => {
      const res = await setCollectingFeesAction({
        on: next,
        expectedVersion: version,
      });
      if (!res.ok) toast.error(res.error);
      else
        toast.success(
          next ? "Collecting fees is on" : "Collecting fees is off",
        );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-accent/40 bg-accent/10 p-4">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-semibold">
          Collecting fees
        </p>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {on
            ? "On: members who owe see how to pay, and you can send reminders."
            : "Off: members see their pledge but no pay guide, and no reminders go."}
        </p>
      </div>
      <span className="flex items-center gap-2">
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        <Switch
          checked={on}
          disabled={pending}
          onCheckedChange={flip}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
        />
        <span className="text-sm font-medium">{on ? "On" : "Off"}</span>
      </span>
    </div>
  );
}
