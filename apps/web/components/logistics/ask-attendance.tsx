"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { toast } from "@camp404/ui/components/toast";
import { askForAttendanceAction } from "@/app/(console)/logistics/actions";
import { attendanceAskedText } from "@/lib/logistics-copy";

// "Ask everyone" for the logistics days, as the gear rental's (#241): a
// captain nudges each member who is coming and has not answered every phase
// still open. A nudge, never a block; pressed again it reaches only those
// still missing, and nobody gets a second notice while the first is unread.
// A one-tap action: what happened, or why not, is a toast.

export function AskAttendance() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await askForAttendanceAction();
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(attendanceAskedText(res.data.asked, res.data.notified));
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
