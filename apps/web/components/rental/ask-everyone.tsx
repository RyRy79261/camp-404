"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { toast } from "@camp404/ui/components/toast";
import { askForGearOrdersAction } from "@/app/(console)/captains/gear-rental/actions";

// "Ask the N who haven't answered" (#241): a captain nudges each member who is coming this year
// and has not sent their gear order. A nudge, never a block. Pressing it again
// reaches only the members who still have not answered, and a member whose
// notice is still unread gets no second one. A one-tap action: what happened,
// or why not, is a toast.

/** What the toast says after an ask. */
export function askedText(asked: number, notified: number): string {
  if (asked === 0) {
    return "Nobody to ask: everyone who is coming has sent their order.";
  }
  const people = asked === 1 ? "1 member" : `${asked} members`;
  if (notified === asked) return `Asked ${people}.`;
  const quiet = asked - notified;
  return notified === 0
    ? `${people} already ${asked === 1 ? "has" : "have"} the ask unread. No second notice was sent.`
    : `Asked ${people}. ${quiet} already had the ask unread and got no second notice.`;
}

/** The button's words: who it reaches, by count. */
export function askLabel(count: number): string {
  return count === 1
    ? "Ask the 1 who hasn\u2019t answered"
    : `Ask the ${count} who haven\u2019t answered`;
}

/** The ask, inside the "Not answered yet" card it acts on. */
export function AskEveryone({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="self-start"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await askForGearOrdersAction();
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(askedText(res.data.asked, res.data.notified));
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Megaphone aria-hidden />
      )}
      {askLabel(count)}
    </Button>
  );
}
