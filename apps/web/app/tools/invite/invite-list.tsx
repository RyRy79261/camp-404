"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CAMP_TIME_ZONE,
  inviteCodeState,
  type InviteCodeState,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { SectionHeader } from "@camp404/ui/components/section-header";
import { toast } from "@camp404/ui/components/toast";
import { revokeInviteAction } from "./actions";

// The codes under the invite form: a member's own, or every code for a captain.
// Each shows whether it can still let someone in and how many it has, and an
// active one can be revoked. No board draws this list (S14 stops at the form);
// it is composed from the kit.

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
    <section className="flex flex-col gap-3">
      <SectionHeader
        as="h2"
        title={isCaptain ? "All invite codes" : "Your invites"}
      />
      {items.length === 0 ? (
        <EmptyState
          title="No invites yet."
          description="Codes you make show up here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const state = inviteCodeState(item, now);
            return (
              <li key={item.code}>
                <Card className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-all font-mono text-sm font-semibold text-foreground">
                      {item.code}
                    </p>
                    <Badge
                      variant={state === "active" ? "default" : "outline"}
                      className="shrink-0"
                    >
                      {STATE_LABEL[state]}
                    </Badge>
                  </div>
                  {item.note && (
                    <p className="text-sm text-foreground">{item.note}</p>
                  )}
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
                  {state === "active" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setError(null);
                        setConfirming(item);
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

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
