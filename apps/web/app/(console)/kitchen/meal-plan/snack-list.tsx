"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import {
  AddSnackInput,
  SNACK_AMOUNT_MAX,
  SNACK_NAME_MAX,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { toast } from "@camp404/ui/components/toast";
import { UNREACHABLE } from "@/lib/recipe-copy";
import { addSnackAction, removeSnackAction } from "./actions";

// The year's snacks (the owner, 2026-09-30: "their own short list", added
// into the shopping list): a name and, if known, an amount as typed. Under
// the meal plan, because snacks are planned with the meals but are not a
// meal. A captain or a Kitchen lead adds and takes off; everyone reads. A
// problem with what was typed shows beside the form; a refused removal is a
// toast.

export interface SnackRow {
  id: string;
  name: string;
  amount: string | null;
}

function RemoveSnack({ snack }: { snack: SnackRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0 text-muted-foreground"
      aria-label={`Take ${snack.name} off the snacks`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          let result: Awaited<ReturnType<typeof removeSnackAction>>;
          try {
            result = await removeSnackAction({ snackId: snack.id });
          } catch {
            toast.error(UNREACHABLE);
            return;
          }
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <X className="h-4 w-4" aria-hidden />
      )}
    </Button>
  );
}

export function SnackList({
  snacks,
  canEdit,
}: {
  snacks: readonly SnackRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(event: FormEvent) {
    event.preventDefault();
    const check = AddSnackInput.safeParse({ name, amount });
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? "Check the snack.");
      return;
    }
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof addSnackAction>>;
      try {
        result = await addSnackAction(check.data);
      } catch {
        setError(UNREACHABLE);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setAmount("");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="snacks-heading" className="flex flex-col gap-3">
      <h2 id="snacks-heading" className="text-lg font-semibold">
        Snacks
      </h2>
      {snacks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No snacks yet.</p>
      ) : (
        <ul
          aria-label="Snacks"
          className="flex flex-col divide-y rounded-xl border bg-card text-card-foreground"
        >
          {snacks.map((snack) => (
            <li
              key={snack.id}
              className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5 text-sm"
            >
              <span className="min-w-0 break-words">{snack.name}</span>
              <span className="flex items-center gap-1">
                {snack.amount && (
                  <span className="text-muted-foreground tabular-nums">
                    {snack.amount}
                  </span>
                )}
                {canEdit && <RemoveSnack snack={snack} />}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          onSubmit={add}
          noValidate
          aria-label="Add a snack"
          className="flex flex-col gap-1.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Snack"
              placeholder="Snack"
              value={name}
              maxLength={SNACK_NAME_MAX}
              disabled={pending}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "snack-error" : undefined}
              className="min-w-0 flex-[2_1_10rem]"
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              aria-label="Amount"
              placeholder="Amount, e.g. 6 packets"
              value={amount}
              maxLength={SNACK_AMOUNT_MAX}
              disabled={pending}
              className="min-w-0 flex-[1_1_8rem]"
              onChange={(e) => setAmount(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Plus aria-hidden />
              )}
              Add snack
            </Button>
          </div>
          {error && (
            <p id="snack-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
