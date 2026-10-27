"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { formatMoney, recommendedPledgeCents } from "@camp404/core";
import { FeeScaleTrack, feeScaleMax, useWindowDirty } from "@camp404/os";
import { FEE_TIMINGS, type FeeTiming } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { OptionCardGroup } from "@camp404/ui/components/option-card-group";
import { toast } from "@camp404/ui/components/toast";
import { savePledgeAction } from "@/app/(console)/dues/actions";
import {
  feeTimingChoice,
  pledgeMarks,
  pledgeNote,
  pledgeTag,
  readPledgeAmount,
  usdLabel,
  type PledgeScale,
} from "@/lib/pledge-view";

// "What can you commit?" (camp fees sprint, the owner's approved mock-up step
// 3): the Join site's floating scale (@camp404/os FeeScaleTrack) to slide, or
// a box to type ANY whole-rand amount (more than Perfect World is fine), with
// the Recommended mark (about US$450 at the rate a captain typed) and the
// dollar label beside the rand figure; then "By when can you pay it?" (the six
// fixed timings) and "I need a subsidy: please talk to me" (then R0 is fine
// and "By when" is optional). It is the pledge write (savePledgeAction): the
// step after a Coming answer, and the pledge on My dues.

/** What the step starts from: the member's saved pledge, if any. */
export interface PledgeValue {
  amountCents: number;
  payBy: FeeTiming | null;
  subsidy: boolean;
}

export interface PledgeStepProps {
  scale: PledgeScale & { usdRate: { asOf: string } };
  /** The burn year the "by when" words name (15 January 2027). */
  burnYear: number;
  pledge: PledgeValue | null;
  /**
   * With no pledge yet, the "by when" already known (an answer to a
   * questionnaire's fee timing question, like the Money Oracle's).
   */
  knownPayBy?: FeeTiming | null;
  /**
   * The fee is charged: its amount is the Finance team's now, so only "by
   * when" and the subsidy answer may change (pledgeRefusal on the server).
   */
  amountLocked?: boolean;
  /** The button's words. */
  submitLabel?: string;
  /** After a save, before the page refreshes (a dialog closes). */
  onSaved?: () => void;
}

export function PledgeStep({
  scale,
  burnYear,
  pledge,
  knownPayBy = null,
  amountLocked = false,
  submitLabel = "Send",
  onSaved,
}: PledgeStepProps) {
  const id = useId();
  const router = useRouter();
  const recommended = recommendedPledgeCents(scale);
  const startCents = pledge?.amountCents ?? recommended;
  const [typed, setTyped] = useState(String(startCents / 100));
  const [cents, setCents] = useState(startCents);
  const startPayBy = (pledge ? pledge.payBy : knownPayBy) ?? "";
  const [payBy, setPayBy] = useState<string>(startPayBy);
  const [subsidy, setSubsidy] = useState(pledge?.subsidy ?? false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty =
    cents !== startCents ||
    payBy !== startPayBy ||
    subsidy !== (pledge?.subsidy ?? false);
  const settle = useWindowDirty(
    dirty && !pending,
    "Your pledge isn't sent yet. Leave it?",
  );

  const top = scale.tiers[scale.tiers.length - 1]?.rands ?? 0;
  const max = feeScaleMax(top);
  const tag = pledgeTag(cents, scale);
  const note = pledgeNote(cents, scale);
  const amount = formatMoney(cents);
  const usd = usdLabel(cents, scale);

  function slide(rands: number) {
    setCents(rands * 100);
    setTyped(String(rands));
    setAmountError(null);
  }

  function type(text: string) {
    setTyped(text);
    const read = readPledgeAmount(text);
    if (read.ok) {
      setCents(read.cents);
      setAmountError(null);
    }
  }

  function send() {
    setError(null);
    const read = amountLocked
      ? ({ ok: true, cents } as const)
      : readPledgeAmount(typed);
    if (!read.ok) {
      setAmountError(read.error);
      return;
    }
    const input = {
      amountCents: read.cents,
      payBy: payBy === "" ? null : payBy,
      subsidy,
    };
    start(async () => {
      const res = await savePledgeAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      settle();
      toast.success(
        res.data.charged
          ? "Sent. Your camp fee is on your dues now."
          : "Sent. Nothing is charged until the captains give you a place.",
      );
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">What can you commit?</CardTitle>
          <CardDescription>
            {amountLocked
              ? "Your fee is set. Ask the Finance team if it needs to change."
              : "A floating scale, not a fixed fee. Pay what you can afford. Slide, or type an amount."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-5 pt-0">
          <output
            htmlFor={amountLocked ? undefined : `${id}-range`}
            aria-live="polite"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
          >
            <span
              data-testid="pledge-amount"
              className="text-2xl font-semibold tabular-nums tracking-tight"
            >
              {amount}
            </span>
            <span className="font-mono text-sm text-muted-foreground">
              {usd}
            </span>
            <span
              data-slot="badge"
              className={`px-1.5 py-0.5 font-pixel text-[10px] uppercase ${
                tag === "Recommended"
                  ? "bg-os-primary text-os-bg"
                  : "bg-os-accent text-os-bg"
              }`}
            >
              {tag}
            </span>
          </output>
          {note && <p className="text-sm">{note}</p>}
          {!amountLocked && (
            <>
              <FeeScaleTrack
                id={`${id}-range`}
                rands={cents / 100}
                onRandsChange={slide}
                max={max}
                subsidyBelow={scale.tiers[0]?.rands ?? 0}
                subsidyName={scale.subsidy.name}
                marks={pledgeMarks(scale)}
                label="What I can commit, in rands"
                valueText={`${amount}, ${usd}, ${tag}`}
                disabled={pending}
              />
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                <InputField
                  label="Or type it (R)"
                  inputMode="numeric"
                  emoji={false}
                  wrapperClassName="w-40"
                  value={typed}
                  error={amountError ?? undefined}
                  onChange={(e) => type(e.currentTarget.value)}
                  disabled={pending}
                />
                <span className="pb-2.5 text-xs text-muted-foreground">
                  More than {scale.tiers[scale.tiers.length - 1]?.name} is fine.
                </span>
              </div>
              <p className="font-mono text-[10px] uppercase text-muted-foreground">
                Dollar figures are a guide at R{scale.usdRate.randsPerDollar} =
                US$1 ({scale.usdRate.asOf}). We pay in rands.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">
            By when can you pay it?{" "}
            {subsidy && (
              <span className="text-sm font-normal text-muted-foreground">
                (optional)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <OptionCardGroup
            aria-label="By when can you pay it?"
            value={payBy}
            onValueChange={setPayBy}
            className="grid grid-cols-1 gap-2 page-sm:grid-cols-2"
            options={FEE_TIMINGS.map((timing) =>
              feeTimingChoice(timing, burnYear),
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 p-5">
          <div className="flex items-start gap-2">
            <Checkbox
              id={`${id}-subsidy`}
              checked={subsidy}
              disabled={pending}
              onCheckedChange={(v) => setSubsidy(v === true)}
            />
            <Label htmlFor={`${id}-subsidy`} className="flex flex-col gap-1">
              <span className="font-semibold">
                I need a subsidy: please talk to me
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {scale.subsidy.note}
              </span>
            </Label>
          </div>
          {subsidy && (
            <p role="status" className="border-l-2 border-accent pl-2 text-sm">
              R0 is fine, and &ldquo;By when&rdquo; is optional. Nobody else
              sees that you asked.
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        className="self-end"
        disabled={pending}
        onClick={send}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {submitLabel}
      </Button>
    </div>
  );
}
