"use client";

import { useTransition } from "react";
import { MEMBERSHIP_TIER_LABEL } from "@camp404/core";
import { MembershipTier } from "@camp404/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import { setMembershipTierAction } from "./actions";

// How long a member stays (#129), a card in the captain's member-profile side
// column: the whole event, or build week only. One tap sets it, so a refused
// change is a toast, as on every captain list. The write is a compare-and-set
// on the value shown here, so a change made meanwhile (by the member through
// Claude, or another captain) is reported rather than overwritten.

const OPTIONS = MembershipTier.options.map((value) => ({
  value,
  label: MEMBERSHIP_TIER_LABEL[value],
}));

export function MembershipTierCard({
  userId,
  tier,
  onChange,
  onStale,
}: {
  userId: string;
  /** The value on screen; null when not set. */
  tier: MembershipTier | null;
  /** The new value, once it is saved. */
  onChange: (tier: MembershipTier) => void;
  /** The change was refused; the caller reloads what is stored. */
  onStale: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function choose(value: string) {
    const to = MembershipTier.safeParse(value);
    if (!to.success || to.data === tier) return;
    startTransition(async () => {
      const res = await setMembershipTierAction({
        userId,
        from: tier,
        to: to.data,
      });
      if (!res.ok) {
        toast.error(res.error);
        onStale();
        return;
      }
      onChange(to.data);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Staying for
          {isPending && <Spinner size="sm" />}
        </CardTitle>
        <CardDescription>
          {tier === null
            ? "Not set yet. Not the same as their fee."
            : "How long they are at the burn. Not the same as their fee."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SegmentedControl
          aria-label="Staying for"
          options={OPTIONS}
          value={tier ?? undefined}
          onValueChange={choose}
          disabled={isPending}
        />
      </CardContent>
    </Card>
  );
}
