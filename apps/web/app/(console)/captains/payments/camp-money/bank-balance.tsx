"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { campDayKey, formatMoney, parseMoneyToMinor } from "@camp404/core";
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
import { formatDay } from "@/lib/dues-view";
import { recordCampBalanceAction } from "../camp-money-actions";

// The bank balance (Camp money, mock-up step 1): Finance types what the bank
// shows and the day it showed it; every one is kept, the latest first, with
// who typed it. The forecast reads the latest. A typing problem shows beside
// the form; the save is a compare-and-set on the latest balance seen.

export interface BalanceEntry {
  id: string;
  amountCents: number;
  asOf: string;
  recordedBy: string | null;
}

/** Below zero is an overdraft: "-1250" or "−1 250,00". */
function parseSigned(text: string): number | null {
  const trimmed = text.trim();
  const negative = /^[-−]/.test(trimmed);
  const cents = parseMoneyToMinor(negative ? trimmed.slice(1) : trimmed);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

export function BankBalance({ balances }: { balances: BalanceEntry[] }) {
  const router = useRouter();
  const id = useId();
  const [amount, setAmount] = useState("");
  const [asOf, setAsOf] = useState(() => campDayKey(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    const cents = parseSigned(amount);
    if (cents === null) {
      setError("Type the balance in rands, like 100000 or 100000,50.");
      return;
    }
    if (!asOf) {
      setError("Pick the day the bank showed it.");
      return;
    }
    start(async () => {
      const res = await recordCampBalanceAction({
        amountCents: cents,
        asOf,
        expectedLatestId: balances[0]?.id ?? null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Balance saved");
      setAmount("");
      router.refresh();
    });
  }

  return (
    <Card id="bank-balance" className="scroll-mt-4">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-base">Bank balance</CardTitle>
        <CardDescription>
          Type what the bank shows. We keep every one.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 pt-0">
        <div className="flex flex-wrap items-end gap-3">
          <InputField
            label="Balance (R)"
            inputMode="decimal"
            emoji={false}
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            disabled={pending}
            wrapperClassName="w-40"
          />
          <div className="flex w-40 flex-col gap-1.5">
            <Label htmlFor={`${id}-on`}>On</Label>
            <DateControl
              id={`${id}-on`}
              value={asOf}
              onChange={(e) => setAsOf(e.currentTarget.value)}
              disabled={pending}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !amount.trim()}
            onClick={save}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Save balance
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {balances.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No balance yet. The forecast starts from R0 until one is typed.
          </p>
        ) : (
          <ul
            aria-label="Balances typed in"
            className="divide-y divide-border border-t border-border"
          >
            {balances.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {formatDay(b.asOf)}
                  {b.recordedBy ? ` · ${b.recordedBy}` : ""}
                </span>
                <span className="tabular-nums">
                  {b.amountCents < 0
                    ? `−${formatMoney(-b.amountCents)}`
                    : formatMoney(b.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
