"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CAMP_TIME_ZONE,
  inviteCodeState,
  type InviteCodeState,
} from "@camp404/core";
import { Trash2 } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@camp404/ui/components/card";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { toast } from "@camp404/ui/components/toast";
import { revokeInviteAction } from "./actions";

// The invite codes beside the form: a member's own, or every code for a captain.
// Each row shows whether it can still let someone in and how many it has, and
// an active one can be revoked. Drawn as the invite-link list on an AfrikaBurn
// camp page: bordered rows with a state badge, inside one card.

export interface InviteListItem {
  code: string;
  note: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  requiresApproval: boolean;
  createdAt: Date;
  /** Shown to a captain when the code is someone else's. */
  createdByName: string | null;
  mine: boolean;
}

const STATE_LABEL: Record<InviteCodeState, string> = {
  active: "Active",
  used_up: "Used up",
  expired: "Expired",
  revoked: "Revoked",
};

const createdFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeZone: CAMP_TIME_ZONE,
});

function usesLine(item: InviteListItem): string {
  if (item.maxUses === null) {
    return `Used ${item.useCount} time${item.useCount === 1 ? "" : "s"}`;
  }
  return `${item.useCount} of ${item.maxUses} used`;
}

export function InviteList({
  items,
  isCaptain,
  now,
}: {
  items: InviteListItem[];
  isCaptain: boolean;
  /** The server's clock, so the state reads the same on both sides. */
  now: Date;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<InviteListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const revoke = () => {
    if (!confirming) return;
    const { code } = confirming;
    setError(null);
    startTransition(async () => {
      const result = await revokeInviteAction(code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(null);
      toast.success(`${code} revoked`);
      router.refresh();
    });
  };

  return (
    <section aria-labelledby="invite-list-heading">
      <Card>
        <CardHeader>
          <h2
            id="invite-list-heading"
            className="text-base font-semibold normal-case leading-none tracking-normal"
          >
            {isCaptain ? "All invite codes" : "Your invites"}
          </h2>
          <CardDescription>
            {isCaptain
              ? "Every code anyone has made, the camp's own included. An active code can still let someone in."
              : "The codes you have made. An active code can still let someone in."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm font-medium text-foreground">
                No invites yet.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Codes you make show up here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const state = inviteCodeState(item, now);
                return (
                  <li
                    key={item.code}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background/40 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={state === "active" ? "success" : "outline"}
                          className="shrink-0"
                        >
                          {STATE_LABEL[state]}
                        </Badge>
                        <code className="min-w-0 break-all font-mono text-sm font-semibold text-foreground">
                          {item.code}
                        </code>
                        {item.note && (
                          <span className="text-sm text-muted-foreground">
                            {item.note}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {usesLine(item)}
                        {" · "}
                        {item.requiresApproval
                          ? "Needs a captain's approval"
                          : "Pre-approved"}
                        {" · "}
                        Made {createdFmt.format(item.createdAt)}
                        {isCaptain && !item.mine
                          ? ` by ${item.createdByName ?? "the camp"}`
                          : ""}
                      </p>
                    </div>
                    {state === "active" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 self-start text-destructive hover:bg-destructive/10 hover:text-destructive sm:self-center"
                        onClick={() => {
                          setError(null);
                          setConfirming(item);
                        }}
                      >
                        <Trash2 aria-hidden />
                        Revoke
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(null);
          }}
          title={`Revoke ${confirming.code}?`}
          description="Nobody else can join with this code. People who already joined with it keep their place."
          confirmLabel="Revoke code"
          destructive
          pending={pending}
          error={error}
          onConfirm={revoke}
        />
      )}
    </section>
  );
}
