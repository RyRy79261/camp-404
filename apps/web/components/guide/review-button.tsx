"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { toast } from "@camp404/ui/components/toast";
import { markGuideChapterReviewedAction } from "@/app/(console)/guide/actions";

// "Still right for 2027" (#250): a writer read last year's chapter again and
// keeps it as it is, with no new version. A one-tap change: a failure is a
// toast, and only this button spins.

export function ReviewButton({ slug, year }: { slug: string; year: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await markGuideChapterReviewedAction({ slug });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`Kept for ${year}`);
          router.refresh();
        })
      }
    >
      <CalendarCheck aria-hidden />
      {pending ? "Saving…" : `Still right for ${year}`}
    </Button>
  );
}
