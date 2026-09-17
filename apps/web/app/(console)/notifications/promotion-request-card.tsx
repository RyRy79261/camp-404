"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldPlus } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  acceptCaptainPromotionAction,
  declineCaptainPromotionAction,
} from "./actions";

// A captain asked this member to become a captain. The request waits here,
// pinned above the inbox, until the member answers: rank is two-sided, so it
// only changes when they accept in their own app (board S17's "They accept in
// their app"). No board draws this card; it is composed from the kit.

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
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <ShieldPlus className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">
            {who} asked you to become a captain
          </h3>
          <p className="text-sm text-muted-foreground">
            Captains run the camp: they approve new members, send announcements,
            and manage the roster. Nothing changes unless you accept.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 gap-2"
          disabled={pending}
          onClick={() => answer("decline")}
        >
          {pending && choice === "decline" && <Spinner size="sm" />}
          Decline
        </Button>
        <Button
          type="button"
          className="flex-1 gap-2"
          disabled={pending}
          onClick={() => answer("accept")}
        >
          {pending && choice === "accept" && <Spinner size="sm" />}
          Accept
        </Button>
      </div>
    </Card>
  );
}
