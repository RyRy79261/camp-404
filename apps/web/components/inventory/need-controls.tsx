"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import {
  EditInventoryNeedInput,
  InventoryNeedInput,
  InventoryPledgeInput,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@camp404/ui/components/dropdown-menu";
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
import { toast } from "@camp404/ui/components/toast";
import {
  addNeedAction,
  pledgeAction,
  removeNeedAction,
  updateNeedAction,
  withdrawPledgeAction,
} from "@/app/(console)/inventory/actions";
import { NativeSelect, type SelectOption } from "./native-select";
import { reached } from "@/lib/reach-action";

// A team's needs for the year and members' pledges against them (#246). A
// captain or a lead of that team keeps the list; any member pledges.

export interface EditableNeed {
  id: string;
  version: number;
  team: string;
  name: string;
  quantity: number;
  itemId: string | null;
  boughtQuantity: number;
  note: string | null;
}

function issuesOf(error: {
  issues: { path: PropertyKey[]; message: string }[];
}) {
  const next: Record<string, string> = {};
  for (const issue of error.issues)
    next[String(issue.path[0])] ??= issue.message;
  return next;
}

const int = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));

function NeedDialog({
  open,
  onOpenChange,
  editing,
  teams,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EditableNeed;
  teams: SelectOption[];
  /** The camp's items a need can point at. */
  items: SelectOption[];
}) {
  const router = useRouter();
  const initial = () => ({
    team: editing?.team ?? teams[0]?.value ?? "",
    name: editing?.name ?? "",
    quantity: String(editing?.quantity ?? 1),
    itemId: editing?.itemId ?? "",
    boughtQuantity: String(editing?.boughtQuantity ?? 0),
    note: editing?.note ?? "",
  });
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const pre = editing ? `need-${editing.id}` : "need-new";

  function close(next: boolean) {
    if (pending) return;
    if (!next) {
      setForm(initial());
      setErrors({});
      setError(null);
    }
    onOpenChange(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const base = {
      team: form.team,
      name: form.name,
      quantity: int(form.quantity),
      itemId: form.itemId || null,
      boughtQuantity:
        form.boughtQuantity.trim() === "" ? 0 : int(form.boughtQuantity),
      note: form.note,
    };
    const payload = editing
      ? { ...base, needId: editing.id, expectedVersion: editing.version }
      : base;
    const check = (
      editing ? EditInventoryNeedInput : InventoryNeedInput
    ).safeParse(payload);
    if (!check.success) {
      setErrors(issuesOf(check.error));
      return;
    }
    setErrors({});
    start(async () => {
      const result = editing
        ? await reached(updateNeedAction(payload))
        : await reached(addNeedAction(payload));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Need saved" : "Need added");
      onOpenChange(false);
      if (!editing) setForm(initial());
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.name}` : "Add a need"}
            </DialogTitle>
            <DialogDescription>
              What the team needs at the burn this year. Pick the camp&apos;s
              own item when there is one, so what we have counts.
            </DialogDescription>
          </DialogHeader>
          <Field
            label="What"
            htmlFor={`${pre}-name`}
            error={errors.name}
            required
          >
            <Input
              id={`${pre}-name`}
              placeholder="Camping chairs"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              aria-invalid={errors.name ? true : undefined}
            />
          </Field>
          <div className="grid gap-4 page-sm:grid-cols-2">
            <Field label="Team" htmlFor={`${pre}-team`}>
              <NativeSelect
                id={`${pre}-team`}
                options={teams}
                value={form.team}
                onChange={(e) =>
                  setForm((f) => ({ ...f, team: e.target.value }))
                }
              />
            </Field>
            <Field
              label="How many needed"
              htmlFor={`${pre}-quantity`}
              error={errors.quantity}
            >
              <Input
                id={`${pre}-quantity`}
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
            <Field label="The camp's item (optional)" htmlFor={`${pre}-item`}>
              <NativeSelect
                id={`${pre}-item`}
                options={items}
                placeholder="None"
                value={form.itemId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, itemId: e.target.value }))
                }
              />
            </Field>
            <Field
              label="Bought so far"
              htmlFor={`${pre}-bought`}
              error={errors.boughtQuantity}
            >
              <Input
                id={`${pre}-bought`}
                type="number"
                inputMode="numeric"
                min={0}
                value={form.boughtQuantity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, boughtQuantity: e.target.value }))
                }
                aria-invalid={errors.boughtQuantity ? true : undefined}
              />
            </Field>
          </div>
          <Field
            label="Note (optional)"
            htmlFor={`${pre}-note`}
            error={errors.note}
          >
            <Input
              id={`${pre}-note`}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
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
              {pending ? "Saving…" : editing ? "Save need" : "Add need"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Add need": shown only to a captain or a team lead (the page decides). */
export function AddNeedButton({
  teams,
  items,
}: {
  teams: SelectOption[];
  items: SelectOption[];
}) {
  const [open, setOpen] = React.useState(false);
  if (teams.length === 0) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Add need
      </Button>
      <NeedDialog
        open={open}
        onOpenChange={setOpen}
        teams={teams}
        items={items}
      />
    </>
  );
}

/**
 * Edit and Remove on a need, for a captain or a lead of its team, behind one
 * "···" in the row's own narrow column, so the pledge button keeps its place.
 */
export function NeedRowActions({
  need,
  teams,
  items,
}: {
  need: EditableNeed;
  teams: SelectOption[];
  items: SelectOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [removing, start] = React.useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Edit or remove ${need.name}`}
            disabled={removing}
          >
            {removing ? (
              <Spinner size="sm" label="Removing…" />
            ) : (
              <MoreHorizontal aria-hidden />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil aria-hidden className="size-4" />
            Edit need
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirming(true)}>
            <Trash2 aria-hidden className="size-4" />
            Remove need
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NeedDialog
        key={`${need.id}:${need.version}`}
        open={editing}
        onOpenChange={setEditing}
        editing={need}
        teams={teams}
        items={items}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${need.name}?`}
        description="It comes off this year's list, with its pledges."
        confirmLabel="Remove need"
        destructive
        pending={removing}
        onConfirm={() =>
          start(async () => {
            const result = await reached(
              removeNeedAction({
                needId: need.id,
                expectedVersion: need.version,
              }),
            );
            setConfirming(false);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success("Need removed");
            router.refresh();
          })
        }
      />
    </>
  );
}

/**
 * The row's one button, in the same slot on every row: "Pledge" when the
 * viewer hasn't, "Edit my pledge" when they have. Taking a pledge back is
 * inside the dialog, so the row never grows a second button.
 */
export function PledgeButton({
  needId,
  name,
  still,
  mine,
  className,
}: {
  needId: string;
  name: string;
  /** How many are still to find, for the dialog's line. */
  still: number;
  /** The viewer's own pledge, if they made one. */
  mine: { quantity: number; note: string | null } | null;
  className?: string;
}) {
  const router = useRouter();
  const initial = () => ({
    quantity: String(mine?.quantity ?? Math.max(1, Math.min(still, 1))),
    note: mine?.note ?? "",
  });
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const busy = pending;

  function close(next: boolean) {
    if (busy) return;
    if (!next) {
      setForm(initial());
      setErrors({});
      setError(null);
    }
    setOpen(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { needId, quantity: int(form.quantity), note: form.note };
    const check = InventoryPledgeInput.safeParse(payload);
    if (!check.success) {
      setErrors(issuesOf(check.error));
      return;
    }
    setErrors({});
    start(async () => {
      const result = await reached(pledgeAction(payload));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(mine ? "Pledge changed" : "Thanks, your pledge is in");
      setOpen(false);
      router.refresh();
    });
  }

  function takeBack() {
    start(async () => {
      const result = await reached(withdrawPledgeAction({ needId }));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Pledge taken back");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant={mine ? "outline" : "default"}
        className={className}
        onClick={() => setOpen(true)}
        aria-label={mine ? `Edit my pledge for ${name}` : `Pledge ${name}`}
      >
        {mine ? "Edit my pledge" : "Pledge"}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{mine ? "Edit my pledge" : "Pledge"}</DialogTitle>
              <DialogDescription>
                {name}.{" "}
                {still > 0
                  ? `${still} still to find.`
                  : "It's covered, so this is extra."}{" "}
                Say how many you&apos;ll bring. Everyone sees your pledge under
                the need.
              </DialogDescription>
            </DialogHeader>
            <Field
              label="How many"
              htmlFor={`pledge-${needId}-quantity`}
              error={errors.quantity}
            >
              <Input
                id={`pledge-${needId}-quantity`}
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
              label="Note (optional)"
              htmlFor={`pledge-${needId}-note`}
              error={errors.note}
            >
              <Input
                id={`pledge-${needId}-note`}
                placeholder="Full ones from home"
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
            <DialogFooter className="gap-2 sm:justify-between">
              {mine ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={takeBack}
                >
                  Take back my pledge
                </Button>
              ) : (
                <span />
              )}
              <span className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => close(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {pending ? "Saving…" : mine ? "Save pledge" : "Pledge"}
                </Button>
              </span>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
