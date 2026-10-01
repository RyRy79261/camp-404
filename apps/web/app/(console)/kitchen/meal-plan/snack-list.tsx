"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AddSnackInput,
  SNACK_AMOUNT_MAX,
  SNACK_NAME_MAX,
} from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import { Input } from "@camp404/ui/components/input";
import { toast } from "@camp404/ui/components/toast";
import { Spin } from "@/components/kitchen/kit";
import { PIXEL_LABEL, QUIET_BUTTON } from "@/components/kitchen/labels";
import { UNREACHABLE } from "@/lib/recipe-copy";
import { addSnackAction, removeSnackAction } from "./actions";

// The year's snacks for a Kitchen lead or a captain (the owner, 2026-09-30:
// "their own short list", added into the shopping list; the approved
// mock-up, design/approved-kmp.html, Option A): under the meal plan, a table
// of Snack | Amount | ×, its last row the boxes to add one. A problem with
// what was typed shows beside the form; a refused removal is a toast. Every
// member reads the snacks at the end of the menu (member-menu.tsx).

export interface SnackRow {
  id: string;
  name: string;
  amount: string | null;
}

/** The columns: the name, the amount, then the × (or Add). */
const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-3 page-md:grid-cols-[minmax(0,1fr)_200px_136px] page-md:gap-0";

function RemoveSnack({ snack }: { snack: SnackRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Take ${snack.name} off the snacks`}
      disabled={pending}
      className="grid h-8 w-8 place-items-center justify-self-end text-xl leading-none text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 page-md:mr-2.5 page-md:h-7 page-md:w-7"
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
      {pending ? <Spin /> : <span aria-hidden>×</span>}
    </button>
  );
}

export function SnackList({ snacks }: { snacks: readonly SnackRow[] }) {
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

  const box =
    "h-8 min-w-0 px-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-primary";

  return (
    <section aria-labelledby="snacks-heading" className="mt-6">
      <h2
        id="snacks-heading"
        className="mb-2 flex items-baseline text-[11px] leading-4 tracking-[0.2em]"
      >
        Snacks
        <span className="ml-2 font-sans text-xs tracking-normal normal-case text-muted-foreground">
          {snacks.length} on the shopping list
        </span>
      </h2>
      <div className="border border-border bg-card">
        <div
          aria-hidden
          className={cn(
            COLUMNS,
            "hidden h-10 border-b border-border page-md:grid",
          )}
        >
          <span className={cn(PIXEL_LABEL, "px-4")}>Snack</span>
          <span className={cn(PIXEL_LABEL, "px-4")}>Amount</span>
          <span />
        </div>
        {snacks.length > 0 && (
          <ul aria-label="Snacks" className="m-0 list-none p-0">
            {snacks.map((snack) => (
              <li
                key={snack.id}
                className={cn(
                  COLUMNS,
                  "min-h-10 border-t border-border/60 py-1 pr-2 pl-4 text-sm first:border-t-0 page-md:p-0",
                )}
              >
                <span className="min-w-0 break-words page-md:px-4">
                  {snack.name}
                </span>
                <span className="whitespace-nowrap tabular-nums page-md:px-4">
                  {snack.amount ?? ""}
                </span>
                <RemoveSnack snack={snack} />
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={add}
          noValidate
          aria-label="Add a snack"
          className="grid grid-cols-[minmax(0,1fr)_96px_auto] gap-2 border-t border-border px-4 py-3 page-md:grid-cols-[minmax(0,1fr)_200px_136px] page-md:gap-0 page-md:py-2 page-md:pl-1"
        >
          <Input
            aria-label="New snack"
            placeholder="Snack, e.g. Droëwors"
            value={name}
            maxLength={SNACK_NAME_MAX}
            disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "snack-error" : undefined}
            className={box}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            aria-label="Amount"
            placeholder="e.g. 2 kg"
            value={amount}
            maxLength={SNACK_AMOUNT_MAX}
            disabled={pending}
            className={cn(box, "page-md:ml-5 page-md:w-[calc(100%-20px)]")}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="submit"
            aria-label="Add snack"
            disabled={pending}
            className={cn(QUIET_BUTTON, "justify-self-end")}
          >
            {pending ? <Spin /> : null}
            <span aria-hidden>
              + Add<span className="hidden page-md:inline"> snack</span>
            </span>
          </button>
        </form>
      </div>
      {error && (
        <p id="snack-error" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
