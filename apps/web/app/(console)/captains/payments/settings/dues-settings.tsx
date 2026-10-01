"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { formatMoney, parseMoneyToMinor } from "@camp404/core";
import type { DuesYear, FeeTier } from "@camp404/db/dues";
import { MAX_FEE_TIERS } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { DateControl } from "@camp404/ui/components/date-control";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { RowActions } from "@camp404/ui/components/row-actions";
import { toast } from "@camp404/ui/components/toast";
import {
  addFeeTierAction,
  archiveFeeTierAction,
  editFeeTierAction,
  saveDuesYearAction,
} from "../dues-actions";
import { typedRands } from "@/lib/dues-view";

// The year's fee tiers and dates (#240). A typing problem shows beside the
// form; removing a tier is a one-tap row action with a toast on failure. A
// new tier is typed on the list's last row (name, amount, then an outlined
// "Add tier" that keeps its border while it waits), not in a box of its own.
// Dates and amounts are sized to what they hold.

const TYPE_AMOUNT = "Type the amount in rands, like 1250 or 1250,50.";

export function DuesSettings({
  tiers,
  year,
}: {
  tiers: FeeTier[];
  year: DuesYear;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();

  // --- Tiers ---------------------------------------------------------------------
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [tierError, setTierError] = useState<string | null>(null);
  const [tierPending, startTier] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  const [removePending, startRemove] = useTransition();

  function startEdit(tier: FeeTier | null) {
    setEditing(tier?.id ?? null);
    setLabel(tier?.label ?? "");
    setAmount(tier ? typedRands(tier.amountCents) : "");
    setTierError(null);
  }

  function saveTier() {
    setTierError(null);
    const cents = parseMoneyToMinor(amount);
    if (cents === null || cents <= 0) {
      setTierError(TYPE_AMOUNT);
      return;
    }
    startTier(async () => {
      const res = editing
        ? await editFeeTierAction({
            tierId: editing,
            label,
            amountCents: cents,
          })
        : await addFeeTierAction({ label, amountCents: cents });
      if (!res.ok) {
        setTierError(res.error);
        return;
      }
      toast.success(editing ? "Tier saved" : "Tier added");
      startEdit(null);
      router.refresh();
    });
  }

  async function removeTier(tier: FeeTier) {
    const sure = await confirm({
      title: `Remove "${tier.label}"?`,
      description:
        "Members can no longer pick it. Anyone who already pledged it keeps their pledge.",
      confirmLabel: "Remove tier",
      destructive: true,
    });
    if (!sure) return;
    setRemoving(tier.id);
    startRemove(async () => {
      const res = await archiveFeeTierAction({ tierId: tier.id });
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }

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

  const busy = tierPending || removePending || datesPending;

  return (
    <div className="grid items-start gap-6 page-lg:grid-cols-2">
      {confirmDialog}
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">Fee tiers</CardTitle>
          <CardDescription>
            What a member may pledge this year, cheapest first. A member may
            also pledge less than the lowest tier.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5 pt-0">
          {tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tiers yet. Members can pledge once there is at least one.
            </p>
          ) : (
            <ul aria-label="Fee tiers" className="divide-y divide-border">
              {tiers.map((tier) => (
                <li
                  key={tier.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {tier.label}
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatMoney(tier.amountCents)}
                    </span>
                  </span>
                  <RowActions
                    secondarySlots={2}
                    secondary={
                      <>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Change ${tier.label}`}
                          disabled={busy}
                          onClick={() => startEdit(tier)}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${tier.label}`}
                          disabled={busy}
                          onClick={() => void removeTier(tier)}
                        >
                          {removePending && removing === tier.id ? (
                            <Loader2 className="animate-spin" aria-hidden />
                          ) : (
                            <Trash2 aria-hidden />
                          )}
                        </Button>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          <div
            role="group"
            aria-label={editing ? "Change the tier" : "Add a tier"}
            className="flex flex-col gap-2 border-t border-border pt-4"
          >
            <div className="grid gap-3 page-sm:grid-cols-[minmax(0,1fr)_8rem_auto] page-sm:items-end">
              <InputField
                label="Name"
                value={label}
                maxLength={60}
                onChange={(e) => setLabel(e.currentTarget.value)}
                disabled={tierPending}
              />
              <InputField
                label="Amount (R)"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.currentTarget.value)}
                disabled={tierPending}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    busy ||
                    !label.trim() ||
                    !amount.trim() ||
                    (!editing && tiers.length >= MAX_FEE_TIERS)
                  }
                  onClick={saveTier}
                >
                  {tierPending ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : editing ? null : (
                    <Plus aria-hidden />
                  )}
                  {editing ? "Save tier" : "Add tier"}
                </Button>
                {editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={tierPending}
                    onClick={() => startEdit(null)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            {tierError ? (
              <p role="alert" className="text-sm text-destructive">
                {tierError}
              </p>
            ) : (
              !editing && (
                <p className="text-xs text-muted-foreground">
                  Name a tier so a member knows what it is, like &ldquo;Early
                  bird&rdquo;.
                </p>
              )
            )}
          </div>
        </CardContent>
      </Card>

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
