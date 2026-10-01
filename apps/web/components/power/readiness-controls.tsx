"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListPlus } from "lucide-react";
import {
  AddReadinessItemInput,
  EditReadinessItemInput,
  SHARE_GENERATOR_SOURCES,
  SharingAgreementInput,
  type ShareGeneratorSource,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { DateControl } from "@camp404/ui/components/date-control";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import {
  addReadinessItemAction,
  addWorkPlanAction,
  removeReadinessItemAction,
  removeSharingAction,
  saveSharingAction,
  startChecklistAction,
  tickReadinessItemAction,
  updateReadinessItemAction,
} from "@/app/(console)/power/readiness/actions";

// The readiness and sharing controls (#257): a tick and one Edit on each
// checklist row (Remove at the foot of the edit dialog), Add a check, and the
// sharing agreement behind one button. Only an editor is shown any of them
// (the owner's approved redesign, 2026-10-01). A tick is a one-tap change:
// its failure is a toast.

function ServerError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm font-medium text-destructive">
      {error}
    </p>
  ) : null;
}

export interface MemberOption {
  id: string;
  displayName: string;
}

// --- The checklist ------------------------------------------------------------

export function StartChecklistButton({
  generatorId,
  model,
}: {
  generatorId: string;
  model: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      aria-label={`Start the checklist for ${model}`}
      onClick={() =>
        startTransition(async () => {
          const result = await startChecklistAction({ generatorId });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`Checklist started for ${model}`);
          router.refresh();
        })
      }
    >
      {pending ? (
        <Spinner size="sm" label="Starting…" />
      ) : (
        <ListPlus aria-hidden />
      )}
      Start the checklist
    </Button>
  );
}

export interface EditableItem {
  id: string;
  version: number;
  label: string;
  ownerUserId: string | null;
  dueOn: string | null;
  done: boolean;
}

/** The Select's value for "nobody yet"; Radix has no empty value. */
const NOBODY = "nobody";

function ItemDialog({
  item,
  members,
  open,
  onOpenChange,
  onRemove,
}: {
  item: EditableItem;
  members: MemberOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const [owner, setOwner] = React.useState(item.ownerUserId ?? NOBODY);
  const [dueOn, setDueOn] = React.useState(item.dueOn ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      itemId: item.id,
      expectedVersion: item.version,
      ownerUserId: owner === NOBODY ? null : owner,
      dueOn: dueOn === "" ? null : dueOn,
    };
    const check = EditReadinessItemInput.safeParse(payload);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        next[String(issue.path[0] ?? "form")] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await updateReadinessItemAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Item updated");
      onOpenChange(false);
      router.refresh();
    });
  }

  const known = members.some((m) => m.id === owner) || owner === NOBODY;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent data-window-tint className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{item.label}</DialogTitle>
            <DialogDescription>Who sees to it, and by when.</DialogDescription>
          </DialogHeader>
          <Field
            label="Who sees to it"
            htmlFor={`${idBase}-owner`}
            error={errors.ownerUserId}
          >
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger id={`${idBase}-owner`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOBODY}>Nobody yet</SelectItem>
                {!known && (
                  <SelectItem value={owner}>
                    The member it was given to
                  </SelectItem>
                )}
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Due by" htmlFor={`${idBase}-due`} error={errors.dueOn}>
            <DateControl
              id={`${idBase}-due`}
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
          </Field>
          <ServerError error={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              className="text-destructive sm:mr-auto"
              onClick={() => {
                onOpenChange(false);
                onRemove();
              }}
            >
              Remove check
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save check"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** An item's tick: a one-tap change whose failure is a toast. */
export function ItemTick({ item }: { item: EditableItem }) {
  const router = useRouter();
  const [ticking, startTick] = React.useTransition();

  function tick(done: boolean) {
    startTick(async () => {
      const result = await tickReadinessItemAction({ itemId: item.id, done });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="flex size-5 shrink-0 items-center justify-center">
      {ticking ? (
        <Spinner size="sm" label="Saving…" />
      ) : (
        <Checkbox
          className="size-5 rounded-none border-2 border-[var(--color-choice-edge)] bg-[var(--color-choice)] data-[state=checked]:border-primary"
          checked={item.done}
          onCheckedChange={(v) => tick(v === true)}
          aria-label={
            item.done ? `${item.label}: done` : `${item.label}: not done`
          }
        />
      )}
    </span>
  );
}

/** One Edit button for a check; Remove sits at the foot of its dialog. */
export function ItemEdit({
  item,
  members,
}: {
  item: EditableItem;
  members: MemberOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [removing, startRemove] = React.useTransition();

  function confirmRemove() {
    startRemove(async () => {
      const result = await removeReadinessItemAction({
        itemId: item.id,
        expectedVersion: item.version,
      });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Check removed");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-[10px]"
        disabled={removing}
        onClick={() => setEditOpen(true)}
        aria-label={`Edit ${item.label}`}
      >
        {removing ? <Spinner size="sm" label="Removing…" /> : "Edit"}
      </Button>
      <ItemDialog
        key={`${item.id}:${item.version}`}
        item={item}
        members={members}
        open={editOpen}
        onOpenChange={setEditOpen}
        onRemove={() => setConfirming(true)}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove "${item.label}"?`}
        description="It comes off this generator's checklist for this year."
        confirmLabel="Remove check"
        destructive
        pending={removing}
        onConfirm={confirmRemove}
      />
    </>
  );
}

/** Adds a check to a generator's checklist, in a small dialog. */
export function AddCheckButton({
  generatorId,
  model,
  variant = "default",
}: {
  generatorId: string;
  model: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = { generatorId, label };
    const check = AddReadinessItemInput.safeParse(payload);
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? "Say what needs doing.");
      return;
    }
    startTransition(async () => {
      const result = await addReadinessItemAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLabel("");
      toast.success("Check added");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        Add a check
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          if (!next) {
            setLabel("");
            setError(null);
          }
          setOpen(next);
        }}
      >
        <DialogContent data-window-tint className="sm:max-w-lg">
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Add a check</DialogTitle>
              <DialogDescription>
                Something to see to on the {model} before the burn.
              </DialogDescription>
            </DialogHeader>
            <Field
              label="What needs doing"
              htmlFor={`${idBase}-label`}
              required
              error={error ?? undefined}
              help="Such as 'Borrow the trailer'."
            >
              <Input
                id={`${idBase}-label`}
                value={label}
                maxLength={80}
                onChange={(e) => setLabel(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add check"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- The work plan ------------------------------------------------------------

export function AddWorkPlanButton({
  fromCycle,
}: {
  /** The year it copies from, or null for the template. */
  fromCycle: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const name =
    fromCycle === null
      ? "Put the work plan on the task board"
      : `Copy ${fromCycle}'s work plan to the task board`;
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await addWorkPlanAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(
            `${result.data.count} tasks added to the task board for Power & Lighting`,
          );
          router.refresh();
        })
      }
    >
      {pending ? (
        <Spinner size="sm" label="Adding…" />
      ) : (
        <ListPlus aria-hidden />
      )}
      {name}
    </Button>
  );
}

// --- Sharing ------------------------------------------------------------------

export interface SharingValues {
  partnerCamp: string;
  contactRole: string | null;
  generatorSource: ShareGeneratorSource;
  generatorId: string | null;
  theirGenerator: string | null;
  partnerFuelPct: number | null;
  watchCover: string | null;
  version: number;
}

const SOURCE_LABELS: Record<ShareGeneratorSource, string> = {
  ours: "Ours",
  theirs: "Theirs",
};

/** The Select's value for "none chosen". */
const NO_GENERATOR = "none";

/**
 * The year's sharing agreement behind one button: "Set up sharing" with none,
 * "Change the agreement" with one. Save closes the dialog; Remove sits at its
 * foot and asks first.
 */
export function ChangeAgreementButton({
  agreement,
  generators,
  proposedTheirPct,
  defaultGeneratorId,
}: {
  agreement: SharingValues | null;
  generators: { id: string; label: string }[];
  /** Their share from each camp's kWh, to one place. */
  proposedTheirPct: number;
  /** The fuel plan's generator: the one a new agreement shares. */
  defaultGeneratorId: string | null;
}) {
  const router = useRouter();
  const initial = () => ({
    partnerCamp: agreement?.partnerCamp ?? "",
    contactRole: agreement?.contactRole ?? "",
    generatorSource:
      agreement?.generatorSource ?? ("ours" as ShareGeneratorSource),
    generatorId:
      agreement?.generatorId ??
      (defaultGeneratorId && generators.some((g) => g.id === defaultGeneratorId)
        ? defaultGeneratorId
        : (generators[0]?.id ?? NO_GENERATOR)),
    theirGenerator: agreement?.theirGenerator ?? "",
    partnerFuelPct:
      agreement?.partnerFuelPct != null ? String(agreement.partnerFuelPct) : "",
    watchCover: agreement?.watchCover ?? "",
  });
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);
  const [removing, startRemove] = React.useTransition();
  const idBase = React.useId();
  const id = (n: string) => `${idBase}-${n}`;
  const set = <K extends keyof ReturnType<typeof initial>>(
    key: K,
    value: ReturnType<typeof initial>[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  function reset() {
    setForm(initial());
    setErrors({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pct = form.partnerFuelPct.trim();
    const payload = {
      partnerCamp: form.partnerCamp,
      contactRole: form.contactRole,
      generatorSource: form.generatorSource,
      generatorId:
        form.generatorSource === "ours" && form.generatorId !== NO_GENERATOR
          ? form.generatorId
          : null,
      theirGenerator: form.theirGenerator,
      partnerFuelPct: pct === "" ? null : Number(pct),
      watchCover: form.watchCover,
      expectedVersion: agreement?.version ?? 0,
    };
    const check = SharingAgreementInput.safeParse(payload);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        next[String(issue.path[0] ?? "form")] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await saveSharingAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Sharing agreement saved");
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    if (!agreement) return;
    startRemove(async () => {
      const result = await removeSharingAction({
        expectedVersion: agreement.version,
      });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Sharing agreement removed");
      router.refresh();
    });
  }

  return (
    <>
      <Button disabled={removing} onClick={() => setOpen(true)}>
        {removing ? (
          <Spinner size="sm" label="Removing…" />
        ) : agreement ? (
          "Change the agreement"
        ) : (
          "Set up sharing"
        )}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          if (!next) reset();
          setOpen(next);
        }}
      >
        <DialogContent
          data-window-tint
          className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"
        >
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Sharing with a neighbouring camp</DialogTitle>
              <DialogDescription>
                Who, whose generator, the fuel split and the watches. Litres
                only: how they pay for their share is agreed between the camps.
              </DialogDescription>
            </DialogHeader>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field
                label="Neighbouring camp"
                htmlFor={id("camp")}
                required
                error={errors.partnerCamp}
              >
                <Input
                  id={id("camp")}
                  value={form.partnerCamp}
                  maxLength={80}
                  onChange={(e) => set("partnerCamp", e.target.value)}
                />
              </Field>
              <Field
                label="Who to speak to there"
                htmlFor={id("role")}
                error={errors.contactRole}
                help="A role, such as 'their power lead'. No phone numbers or emails."
              >
                <Input
                  id={id("role")}
                  value={form.contactRole}
                  maxLength={60}
                  onChange={(e) => set("contactRole", e.target.value)}
                />
              </Field>
              <Field label="Whose generator" htmlFor={id("source")}>
                <Select
                  value={form.generatorSource}
                  onValueChange={(v) =>
                    set("generatorSource", v as ShareGeneratorSource)
                  }
                >
                  <SelectTrigger id={id("source")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHARE_GENERATOR_SOURCES.map((src) => (
                      <SelectItem key={src} value={src}>
                        {SOURCE_LABELS[src]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {form.generatorSource === "ours" ? (
                <Field
                  label="Which of ours"
                  htmlFor={id("gen")}
                  required
                  error={errors.generatorId}
                >
                  <Select
                    value={form.generatorId}
                    onValueChange={(v) => set("generatorId", v)}
                  >
                    <SelectTrigger id={id("gen")}>
                      <SelectValue placeholder="Pick a generator" />
                    </SelectTrigger>
                    <SelectContent>
                      {generators.length === 0 && (
                        <SelectItem value={NO_GENERATOR} disabled>
                          Add a generator on the fuel estimate first
                        </SelectItem>
                      )}
                      {generators.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field
                  label="Their generator"
                  htmlFor={id("theirs")}
                  error={errors.theirGenerator}
                >
                  <Input
                    id={id("theirs")}
                    value={form.theirGenerator}
                    maxLength={80}
                    onChange={(e) => set("theirGenerator", e.target.value)}
                  />
                </Field>
              )}
            </div>

            <Field
              label="Their share of the fuel (%)"
              htmlFor={id("pct")}
              error={errors.partnerFuelPct}
              help={
                proposedTheirPct > 0
                  ? `Leave it empty to split by what each camp plugs in: ${proposedTheirPct}% from their loads on the load list.`
                  : "Leave it empty to split by what each camp plugs in (their loads go on the load list, marked Neighbour)."
              }
            >
              <Input
                id={id("pct")}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="any"
                value={form.partnerFuelPct}
                onChange={(e) => set("partnerFuelPct", e.target.value)}
                className="sm:max-w-40"
              />
            </Field>

            <Field
              label="Who covers which watches"
              htmlFor={id("watch")}
              error={errors.watchCover}
              help="Camps and times, such as 'They cover 00:00–06:00'. No names or phone numbers."
            >
              <Textarea
                id={id("watch")}
                value={form.watchCover}
                maxLength={300}
                rows={2}
                onChange={(e) => set("watchCover", e.target.value)}
              />
            </Field>

            <ServerError error={error} />
            <DialogFooter>
              {agreement && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  className="text-destructive sm:mr-auto"
                  onClick={() => {
                    reset();
                    setOpen(false);
                    setConfirming(true);
                  }}
                >
                  Remove agreement
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save agreement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {agreement && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Remove the sharing agreement?"
          description="This year's plan goes back to running the generator for the camp alone. The neighbour's loads stay on the load list."
          confirmLabel="Remove agreement"
          destructive
          pending={removing}
          onConfirm={remove}
        />
      )}
    </>
  );
}
