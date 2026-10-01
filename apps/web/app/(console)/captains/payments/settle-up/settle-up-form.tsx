"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Scale } from "lucide-react";
import { formatMoney, parseMoneyToMinor, splitEvenly } from "@camp404/core";
import type { SettleUpCandidate } from "@camp404/db/dues";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { toast } from "@camp404/ui/components/toast";
import { publishSettleUpAction } from "../dues-actions";

// The settle-up form (#240): what it is for, the total, and which way the
// money goes. The split is worked out here with the same function the server
// uses (splitEvenly), so the preview is the split; publishing sends the ids
// previewed, and the server refuses if the members changed meanwhile. The
// button comes after the split, so it is read before it is pressed, and says
// what pressing it does ("Add R 840,00 to 5 members' dues"); it stays
// disabled until there is something to add, then asks once more.

/** "5 members' dues", "1 member's dues". */
function whose(count: number): string {
  return count === 1 ? "1 member's dues" : `${count} members' dues`;
}

export function SettleUpForm({
  candidates,
}: {
  candidates: SettleUpCandidate[];
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [direction, setDirection] = useState<"top_up" | "refund">("top_up");
  const [skipConcessions, setSkipConcessions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startPublish] = useTransition();

  const members = candidates.filter((c) => !(skipConcessions && c.concession));
  const totalCents = parseMoneyToMinor(total);
  const shares =
    totalCents && totalCents > 0
      ? splitEvenly(
          totalCents,
          members.map((m) => m.userId),
        )
      : null;
  const amounts = shares ? [...shares.values()] : [];
  const low = amounts.length ? Math.min(...amounts) : 0;
  const people =
    members.length === 1 ? "1 member" : `${members.length} members`;
  const high = amounts.length ? Math.max(...amounts) : 0;
  const share = low === high ? formatMoney(high) : `about ${formatMoney(high)}`;
  const ready =
    description.trim() !== "" && shares !== null && members.length > 0;
  const actionLabel = !ready
    ? direction === "top_up"
      ? "Add to members' dues"
      : "Give money back"
    : direction === "top_up"
      ? `Add ${share} to ${whose(members.length)}`
      : `Give ${share} back on ${whose(members.length)}`;

  function check(): boolean {
    setError(null);
    if (!description.trim()) {
      setError("Say what the settle-up is for.");
      return false;
    }
    if (totalCents === null || totalCents <= 0) {
      setError("Type the total in rands, like 1250 or 1250,50.");
      return false;
    }
    return true;
  }

  function publish() {
    startPublish(async () => {
      const res = await publishSettleUpAction({
        description,
        totalCents,
        direction,
        skipConcessions,
        previewedUserIds: members.map((m) => m.userId),
      });
      if (!res.ok) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      toast.success(
        res.data.members === 1
          ? "Added to 1 member's dues"
          : `Added to ${res.data.members} members' dues`,
      );
      setConfirming(false);
      setDescription("");
      setTotal("");
      router.refresh();
    });
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={<Scale aria-hidden />}
        title="Nobody to share it across yet."
        description="A settle-up is shared across everyone with a camp fee this year. Fees are charged when members are accepted."
      />
    );
  }

  return (
    <div className="grid items-start gap-6 page-lg:grid-cols-3">
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={
          direction === "top_up"
            ? "Add the settle-up to their dues?"
            : "Give the settle-up back?"
        }
        description={
          direction === "top_up"
            ? `${people} each get a charge of about ${formatMoney(high)} on their dues.`
            : `${people} each get about ${formatMoney(high)} back on their dues.`
        }
        confirmLabel={actionLabel}
        pending={pending}
        error={error}
        onConfirm={publish}
      />

      <Card className="page-lg:col-span-1">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">The settle-up</CardTitle>
          <CardDescription>
            It goes on each member&rsquo;s dues as its own line.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5 pt-0">
          <InputField
            label="What it is for"
            value={description}
            maxLength={200}
            placeholder="Gas and water top-up"
            onChange={(e) => setDescription(e.currentTarget.value)}
            disabled={pending}
          />
          <InputField
            label="Total (R)"
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.currentTarget.value)}
            disabled={pending}
          />
          <div className="flex flex-col gap-1.5">
            <Label id="settle-direction">Which way</Label>
            <SegmentedControl
              aria-label="Which way"
              value={direction}
              onValueChange={(v) => setDirection(v as "top_up" | "refund")}
              options={[
                { value: "top_up", label: "They pay more" },
                { value: "refund", label: "They get money back" },
              ]}
              disabled={pending}
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="skip-concessions"
              className="mt-0.5"
              checked={skipConcessions}
              onCheckedChange={(v) => setSkipConcessions(v === true)}
              disabled={pending}
            />
            {/* Body text, not the form's small capitals: it is a sentence. */}
            <label htmlFor="skip-concessions" className="text-sm leading-snug">
              Leave out members whose fee Finance lowered
            </label>
          </div>
        </CardContent>
      </Card>

      <section
        aria-labelledby="settle-preview"
        className="flex min-w-0 flex-col gap-3 page-lg:col-span-2"
      >
        <h2
          id="settle-preview"
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          The split
        </h2>
        <p role="status" className="text-sm text-muted-foreground">
          {shares
            ? low === high
              ? `${people}, ${formatMoney(low)} each.`
              : `${people}, ${formatMoney(low)} to ${formatMoney(high)} each (the cents left over go one each, so it adds up to ${formatMoney(totalCents!)}).`
            : `${people}. Type a total to see each share.`}
        </p>
        <ul
          aria-label="Members in the settle-up"
          className="divide-y divide-border rounded-xl border border-border bg-card"
        >
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{m.name}</span>
                {m.concession && <Badge variant="outline">Lowered</Badge>}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {shares
                  ? `${direction === "refund" ? "− " : ""}${formatMoney(shares.get(m.userId) ?? 0)}`
                  : "—"}
              </span>
            </li>
          ))}
        </ul>
        {error && !confirming && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="button"
          className="self-start"
          disabled={pending || !ready}
          onClick={() => check() && setConfirming(true)}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {actionLabel}
        </Button>
      </section>
    </div>
  );
}
