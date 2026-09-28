"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Check,
  ClipboardEdit,
  HandHelping,
  PackageCheck,
  Undo2,
  X,
} from "lucide-react";
import {
  INVENTORY_CONDITIONS,
  INVENTORY_LOCATIONS,
  InventoryLoanInput,
  InventoryProposalInput,
  type InventoryCondition,
  type InventoryLocation,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { AckRow } from "@camp404/ui/components/checkbox";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import {
  archiveItemAction,
  bookItemAction,
  cancelBookingAction,
  lendItemAction,
  proposeChangeAction,
  returnLoanAction,
  reviewChangeAction,
} from "@/app/(console)/inventory/actions";
import type { ActionResult } from "@/lib/action-result";
import {
  CONDITION_LABELS,
  INVENTORY_PATH,
  LOCATION_LABELS,
} from "@/lib/inventory-copy";
import { NativeSelect, type SelectOption } from "./native-select";

// The inventory's one-tap controls and small dialogs (#246). A one-tap change
// on a row reports its failure as a toast and only the control used spins; a
// dialog shows what was typed wrong beside it (AGENTS.md). The server checks
// who may do each one regardless: nothing here is the boundary.

/** Runs one action from a button: a toast either way, then a refresh. */
function useOneTap() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = React.useCallback(
    (action: () => Promise<ActionResult>, done: string, after?: () => void) =>
      start(async () => {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(done);
        after?.();
        router.refresh();
      }),
    [router],
  );
  return { pending, run };
}

function issuesOf(error: {
  issues: { path: PropertyKey[]; message: string }[];
}) {
  const next: Record<string, string> = {};
  for (const issue of error.issues)
    next[String(issue.path[0])] ??= issue.message;
  return next;
}

const CONDITION_OPTIONS = INVENTORY_CONDITIONS.map((v) => ({
  value: v,
  label: CONDITION_LABELS[v],
}));
const LOCATION_OPTIONS = INVENTORY_LOCATIONS.map((v) => ({
  value: v,
  label: LOCATION_LABELS[v],
}));

// --- Suggest a change ---------------------------------------------------------

export interface ProposalStart {
  itemId: string;
  name: string;
  quantity: number;
  condition: InventoryCondition;
  location: InventoryLocation;
  custodianUserId: string | null;
  storageLocation: string | null;
  requiresMaintenance: boolean;
}

/** Any member: a new count, condition or place, or maintenance done. */
export function SuggestChangeButton({
  item,
  members,
}: {
  item: ProposalStart;
  members: SelectOption[];
}) {
  const router = useRouter();
  const initial = () => ({
    quantity: String(item.quantity),
    condition: item.condition as string,
    location: item.location as string,
    custodianUserId: item.custodianUserId ?? "",
    storageLocation: item.storageLocation ?? "",
    maintenanceDone: false,
    note: "",
  });
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function close(next: boolean) {
    if (pending) return;
    if (!next) {
      setForm(initial());
      setErrors({});
      setError(null);
    }
    setOpen(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      itemId: item.itemId,
      quantity:
        form.quantity.trim() === "" ? Number.NaN : Number(form.quantity),
      condition: form.condition,
      location: form.location,
      custodianUserId: form.custodianUserId || null,
      storageLocation: form.storageLocation,
      maintenanceDone: form.maintenanceDone,
      note: form.note,
    };
    const check = InventoryProposalInput.safeParse(payload);
    if (!check.success) {
      setErrors(issuesOf(check.error));
      return;
    }
    setErrors({});
    start(async () => {
      const result = await proposeChangeAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Change sent for review");
      setOpen(false);
      setForm(initial());
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ClipboardEdit aria-hidden />
        Suggest a change
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Suggest a change to {item.name}</DialogTitle>
              <DialogDescription>
                Say what you found. A captain or the team&apos;s lead checks it
                before the item changes.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 page-sm:grid-cols-2">
              <Field
                label="How many"
                htmlFor="suggest-quantity"
                error={errors.quantity}
              >
                <Input
                  id="suggest-quantity"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quantity: e.target.value }))
                  }
                  aria-invalid={errors.quantity ? true : undefined}
                />
              </Field>
              <Field label="Condition" htmlFor="suggest-condition">
                <NativeSelect
                  id="suggest-condition"
                  options={CONDITION_OPTIONS}
                  value={form.condition}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, condition: e.target.value }))
                  }
                />
              </Field>
              <Field label="Where it is" htmlFor="suggest-location">
                <NativeSelect
                  id="suggest-location"
                  options={LOCATION_OPTIONS}
                  value={form.location}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, location: e.target.value }))
                  }
                />
              </Field>
              {form.location === "custodian_home" ? (
                <Field
                  label="Whose home"
                  htmlFor="suggest-custodian"
                  error={errors.custodianUserId}
                >
                  <NativeSelect
                    id="suggest-custodian"
                    options={members}
                    placeholder="Pick a member"
                    value={form.custodianUserId}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        custodianUserId: e.target.value,
                      }))
                    }
                  />
                </Field>
              ) : (
                <Field label="Spot (optional)" htmlFor="suggest-spot">
                  <Input
                    id="suggest-spot"
                    value={form.storageLocation}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        storageLocation: e.target.value,
                      }))
                    }
                  />
                </Field>
              )}
            </div>
            {item.requiresMaintenance && (
              <AckRow
                checked={form.maintenanceDone}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, maintenanceDone: v === true }))
                }
              >
                I did its maintenance today
              </AckRow>
            )}
            <Field
              label="Note (optional)"
              htmlFor="suggest-note"
              error={errors.note}
            >
              <Textarea
                id="suggest-note"
                rows={2}
                placeholder="Counted 3, one lid is cracked"
                value={form.note}
                onChange={(e) =>
                  setForm((f) => ({ ...f, note: e.target.value }))
                }
              />
            </Field>
            {error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => close(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send for review"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- Review ---------------------------------------------------------------------

/** Approve and Reject on a proposal, for a captain or the item's team lead. */
export function ReviewButtons({
  updateId,
  what,
}: {
  updateId: string;
  /** Names the change for a screen reader: "Cooler box: 3". */
  what: string;
}) {
  const { pending, run } = useOneTap();
  const [which, setWhich] = React.useState<"approved" | "rejected" | null>(
    null,
  );
  const review = (decision: "approved" | "rejected") => {
    setWhich(decision);
    run(
      () => reviewChangeAction({ updateId, decision }),
      decision === "approved" ? "Change approved" : "Change rejected",
    );
  };
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => review("approved")}
        aria-label={`Approve ${what}`}
      >
        {pending && which === "approved" ? (
          <Spinner size="sm" label="Approving…" />
        ) : (
          <Check aria-hidden />
        )}
        Approve
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => review("rejected")}
        aria-label={`Reject ${what}`}
      >
        {pending && which === "rejected" ? (
          <Spinner size="sm" label="Rejecting…" />
        ) : (
          <X aria-hidden />
        )}
        Reject
      </Button>
    </span>
  );
}

// --- Archive --------------------------------------------------------------------

export function ArchiveItemButton({
  itemId,
  name,
  version,
}: {
  itemId: string;
  name: string;
  version: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setConfirming(true)}
        disabled={pending}
      >
        <Archive aria-hidden />
        Archive
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Archive ${name}?`}
        description="It leaves the list. Its history, bookings and loans stay."
        confirmLabel="Archive item"
        destructive
        pending={pending}
        onConfirm={() =>
          start(async () => {
            const result = await archiveItemAction({
              itemId,
              expectedVersion: version,
            });
            setConfirming(false);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success("Item archived");
            router.push(INVENTORY_PATH);
          })
        }
      />
    </>
  );
}

// --- Bookings -------------------------------------------------------------------

export function BookButton({
  itemId,
  name,
  disabled,
}: {
  itemId: string;
  name: string;
  disabled?: boolean;
}) {
  const { pending, run } = useOneTap();
  return (
    <Button
      size="sm"
      disabled={disabled || pending}
      onClick={() => run(() => bookItemAction({ itemId }), `Booked ${name}`)}
      aria-label={`Book ${name}`}
    >
      {pending ? (
        <Spinner size="sm" label="Booking…" />
      ) : (
        <PackageCheck aria-hidden />
      )}
      Book
    </Button>
  );
}

export function CancelBookingButton({
  bookingId,
  label,
}: {
  bookingId: string;
  /** "Cancel my booking of Cooler box", "Cancel Sam's booking". */
  label: string;
}) {
  const { pending, run } = useOneTap();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        run(() => cancelBookingAction({ bookingId }), "Booking cancelled")
      }
      aria-label={label}
    >
      {pending ? <Spinner size="sm" label="Cancelling…" /> : <X aria-hidden />}
      Cancel
    </Button>
  );
}

// --- Loans ------------------------------------------------------------------------

/** Lend some to another camp: their camp's name and site address only. */
export function LendButton({ itemId, name }: { itemId: string; name: string }) {
  const router = useRouter();
  const blank = { quantity: "1", borrowerCamp: "", borrowerAddress: "" };
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(blank);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function close(next: boolean) {
    if (pending) return;
    if (!next) {
      setForm(blank);
      setErrors({});
      setError(null);
    }
    setOpen(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      itemId,
      quantity:
        form.quantity.trim() === "" ? Number.NaN : Number(form.quantity),
      borrowerCamp: form.borrowerCamp,
      borrowerAddress: form.borrowerAddress,
    };
    const check = InventoryLoanInput.safeParse(payload);
    if (!check.success) {
      setErrors(issuesOf(check.error));
      return;
    }
    setErrors({});
    start(async () => {
      const result = await lendItemAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Loan logged");
      setOpen(false);
      setForm(blank);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <HandHelping aria-hidden />
        Lend out
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Lend {name}</DialogTitle>
              <DialogDescription>
                Write down the camp that borrowed it and where they are. No
                names or phone numbers: the address is enough to go and ask for
                it back.
              </DialogDescription>
            </DialogHeader>
            <Field
              label="How many"
              htmlFor="lend-quantity"
              error={errors.quantity}
            >
              <Input
                id="lend-quantity"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.quantity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quantity: e.target.value }))
                }
                aria-invalid={errors.quantity ? true : undefined}
              />
            </Field>
            <Field
              label="Their camp"
              htmlFor="lend-camp"
              error={errors.borrowerCamp}
            >
              <Input
                id="lend-camp"
                value={form.borrowerCamp}
                onChange={(e) =>
                  setForm((f) => ({ ...f, borrowerCamp: e.target.value }))
                }
                aria-invalid={errors.borrowerCamp ? true : undefined}
              />
            </Field>
            <Field
              label="Their site address"
              htmlFor="lend-address"
              error={errors.borrowerAddress}
            >
              <Input
                id="lend-address"
                placeholder="7:30 and C"
                value={form.borrowerAddress}
                onChange={(e) =>
                  setForm((f) => ({ ...f, borrowerAddress: e.target.value }))
                }
                aria-invalid={errors.borrowerAddress ? true : undefined}
              />
            </Field>
            {error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => close(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Log loan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReturnLoanButton({
  loanId,
  what,
}: {
  loanId: string;
  what: string;
}) {
  const { pending, run } = useOneTap();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(() => returnLoanAction({ loanId }), "Marked as returned")
      }
      aria-label={`Mark ${what} returned`}
    >
      {pending ? <Spinner size="sm" label="Saving…" /> : <Undo2 aria-hidden />}
      Returned
    </Button>
  );
}
