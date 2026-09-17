"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldPlus } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  acceptCaptainPromotionAction,
  declineCaptainPromotionAction,
} from "./actions";

// A captain asked this member to become a captain. The request waits here,
// pinned above the inbox, until the member answers: rank is two-sided, so it
// only changes when they accept in their own app. Drawn as the AfrikaBurn
// consent banner (an accent-tinted panel with Accept and Decline).

export function PromotionRequestCard({
  requestId,
  requesterName,
}: {
  requestId: string;
  requesterName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const who = requesterName?.trim() || "A captain";

  const answer = (next: "accept" | "decline") => {
    setChoice(next);
    setError(null);
    startTransition(async () => {
      const result =
        next === "accept"
          ? await acceptCaptainPromotionAction(requestId)
          : await declineCaptainPromotionAction(requestId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        next === "accept" ? "You're a captain now" : "Request declined",
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent/50 bg-accent/10 p-4">
      <div className="flex items-start gap-3">
        <ShieldPlus
          className="mt-0.5 h-5 w-5 shrink-0 text-accent"
          aria-hidden
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-sm font-semibold normal-case tracking-normal text-foreground">
            {who} asked you to become a captain
          </h2>
          <p className="text-sm text-muted-foreground">
            Captains run the camp: they approve new members, send announcements,
            and manage the roster. Nothing changes unless you accept.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 sm:pl-8">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => answer("accept")}
        >
          {pending && choice === "accept" && <Spinner size="sm" />}
          Accept
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => answer("decline")}
        >
          {pending && choice === "decline" && <Spinner size="sm" />}
          Decline
        </Button>
      </div>
    </div>
  );
}
