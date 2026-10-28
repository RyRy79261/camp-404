"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { DuesYear } from "@camp404/db/dues";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { DateControl } from "@camp404/ui/components/date-control";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { toast } from "@camp404/ui/components/toast";
import { saveDuesYearAction } from "../dues-actions";

// The year's dates (#240): the deadline for dues and the refund schedule. A
// typing problem shows beside the form. The fee tiers editor is gone from
// here (camp fees sprint, 2026-10-27): a member pledges any amount on the
// Join site's scale, so the amounts are set there. The fee_tiers table and
// its actions stay, for pledges made on a tier before.

export function DuesSettings({ year }: { year: DuesYear }) {
  const router = useRouter();

  // --- Dates -------------------------------------------------------------------------
  const [deadline, setDeadline] = useState(year.deadline ?? "");
  const [fullUntil, setFullUntil] = useState(year.fullRefundUntil ?? "");
  const [partialUntil, setPartialUntil] = useState(
    year.partialRefundUntil ?? "",
  );
  const [partialPct, setPartialPct] = useState(
    year.partialRefundPct === null ? "" : String(year.partialRefundPct),
  );
  const [datesError, setDatesError] = useState<string | null>(null);
  const [datesPending, startDates] = useTransition();

  function saveDates() {
    setDatesError(null);
    const pct = partialPct.trim() === "" ? null : Number(partialPct);
    startDates(async () => {
      const res = await saveDuesYearAction({
        deadline: deadline || null,
        fullRefundUntil: fullUntil || null,
        partialRefundUntil: partialUntil || null,
        partialRefundPct: pct,
        expectedVersion: year.version,
      });
      if (!res.ok) {
        setDatesError(res.error);
        return;
      }
      toast.success("Dates saved");
      router.refresh();
    });
  }

  const busy = datesPending;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">Dates</CardTitle>
          <CardDescription>
            The deadline for dues, and how much a member gets back if they
            can&rsquo;t come. Leave a date empty for none.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5 pt-0">
          <div className="grid gap-4 page-sm:grid-cols-[12rem_12rem]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dues-deadline">Pay by</Label>
              <DateControl
                id="dues-deadline"
                value={deadline}
                onChange={(e) => setDeadline(e.currentTarget.value)}
                disabled={datesPending}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dues-full-refund">Full refund until</Label>
              <DateControl
                id="dues-full-refund"
                value={fullUntil}
                onChange={(e) => setFullUntil(e.currentTarget.value)}
                disabled={datesPending}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dues-partial-refund">Part refund until</Label>
              <DateControl
                id="dues-partial-refund"
                value={partialUntil}
                onChange={(e) => setPartialUntil(e.currentTarget.value)}
                disabled={datesPending}
              />
            </div>
            <InputField
              label="Part refund (%)"
              inputMode="numeric"
              value={partialPct}
              onChange={(e) => setPartialPct(e.currentTarget.value)}
              disabled={datesPending}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            After the last refund day, nothing is paid back. The Finance team
            can still change any refund&rsquo;s amount.
          </p>
          {datesError && (
            <p role="alert" className="text-sm text-destructive">
              {datesError}
            </p>
          )}
          <Button
            type="button"
            className="self-start"
            disabled={busy}
            onClick={saveDates}
          >
            {datesPending && <Loader2 className="animate-spin" aria-hidden />}
            Save dates
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
