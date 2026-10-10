"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { campDayKey } from "@camp404/core";
import { cn } from "@camp404/ui/lib/utils";
import { PRIMARY_BUTTON } from "./parts";

// "New event" in the Calendar's heading, for captains and team leads: it opens
// the form beside the month (the URL's `new=`, so the open form is a link
// too), on today, or on the 1st of a month that is not this one. The rest of
// the URL stays as it is. A replace, never a prefetch.

export function NewEventButton({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  function open() {
    const today = campDayKey(new Date());
    const month = params.get("month");
    const day =
      params.get("view") !== "list" && month && month !== today.slice(0, 7)
        ? `${month}-01`
        : today;
    const next = new URLSearchParams(params.toString());
    next.delete("event");
    next.set("new", day);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className={cn(PRIMARY_BUTTON, className)}
    >
      <Plus className="h-4 w-4" aria-hidden />
      New event
    </button>
  );
}
