"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { suggestedAmpsForGauge } from "@camp404/core";
import {
  EditGridNodeInput,
  GRID_NODE_KINDS,
  GridNodeInput,
  type GridNodeKind,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  addGridNodeAction,
  assignLoadAction,
  copyLastYearGridAction,
  removeGridNodeAction,
  updateGridNodeAction,
} from "@/app/(console)/power/grid/actions";
import { cn } from "@camp404/ui/lib/utils";
import { GRID_KIND_LABELS } from "@/lib/power-copy";

// The grid plan's controls (#256), laid out as the load list's: Add opens a
// dialog, each point has one Edit with Remove at the foot of its dialog, and
// only an editor is shown any of them. The cable's rating is typed from its label; the form can
// suggest a usual rating for a conductor size, but only fills it when asked,
// so the app never guesses a rating on its own.

/** A point as the dialog edits it. */
export interface EditablePoint {
  id: string;
  version: number;
  name: string;
  kind: GridNodeKind;
  parentId: string | null;
  cable: string | null;
  cableLengthM: number | null;
  cableGaugeMm2: number | null;
  cableRatedAmps: number | null;
  adapter: string | null;
  /** True has it, false must get it, null not checked yet. */
  haveCable: boolean | null;
  haveAdapter: boolean | null;
}

/** A point another can be fed from, with the ids that may not feed each. */
export interface FeedOption {
  id: string;
  label: string;
}

const text = (n: number | null | undefined) => (n == null ? "" : String(n));

/** A blank field is no figure; anything else is read as a number. */
function optionalFigure(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

interface FormState {
  name: string;
  kind: GridNodeKind;
  parentId: string;
  cable: string;
  cableLengthM: string;
  cableGaugeMm2: string;
  cableRatedAmps: string;
  adapter: string;
  haveCable: boolean | null;
  haveAdapter: boolean | null;
}

/** The Select's value for "fed from nothing"; Radix has no empty value. */
const NO_FEED = "none";

function initialState(
  point?: EditablePoint,
  feeds: FeedOption[] = [],
): FormState {
  const hasGenerator = feeds.length > 0;
  return {
    name: point?.name ?? "",
    kind: point?.kind ?? (hasGenerator ? "junction" : "generator"),
    parentId: point?.parentId ?? feeds[0]?.id ?? NO_FEED,
    cable: point?.cable ?? "",
    cableLengthM: text(point?.cableLengthM),
    cableGaugeMm2: text(point?.cableGaugeMm2),
    cableRatedAmps: text(point?.cableRatedAmps),
    adapter: point?.adapter ?? "",
    // Not checked until someone says so: a new point's cable is not the camp's.
    haveCable: point ? point.haveCable : null,
    haveAdapter: point ? point.haveAdapter : null,
  };
}

function GridPointDialog({
  open,
  onOpenChange,
  editing,
  feeds,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EditablePoint;
  /** Offers Remove at the foot of the dialog, for a point already drawn. */
  onRemove?: () => void;
  /** Points this one may be fed from: generators and junctions, not itself or beyond. */
  feeds: FeedOption[];
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(() =>
    initialState(editing, feeds),
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();
  const id = (n: string) => `${idBase}-${n}`;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function reset() {
    setForm(initialState(editing, feeds));
    setErrors({});
    setError(null);
  }

  const isGenerator = form.kind === "generator";
  // A generator is where the grid starts; the other kinds are fed from one.
  const kinds = editing
    ? editing.kind === "generator"
      ? (["generator"] as const)
      : (["junction", "end_point"] as const)
    : GRID_NODE_KINDS;
  const gauge = optionalFigure(form.cableGaugeMm2);
  const suggested =
    gauge !== null && !Number.isNaN(gauge)
      ? suggestedAmpsForGauge(gauge)
      : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      name: form.name,
      kind: form.kind,
      parentId: isGenerator || form.parentId === NO_FEED ? null : form.parentId,
      cable: form.cable,
      cableLengthM: optionalFigure(form.cableLengthM),
      cableGaugeMm2: optionalFigure(form.cableGaugeMm2),
      cableRatedAmps: optionalFigure(form.cableRatedAmps),
      adapter: form.adapter,
      haveCable: form.haveCable,
      haveAdapter: form.haveAdapter,
    };
    const payload = editing
      ? { ...input, nodeId: editing.id, expectedVersion: editing.version }
      : input;
    const check = editing
      ? EditGridNodeInput.safeParse(payload)
      : GridNodeInput.safeParse(payload);
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
      const result = editing
        ? await updateGridNodeAction(payload)
        : await addGridNodeAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Point updated" : "Point added");
      if (!editing) reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        data-window-tint
        className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit point" : "Add a point"}</DialogTitle>
            <DialogDescription>
              A point is the generator, a junction, or where things plug in.
              Every point but the generator has the cable that feeds it.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              htmlFor={id("name")}
              required
              error={errors.name}
            >
              <Input
                id={id("name")}
                value={form.name}
                maxLength={60}
                onChange={(e) => set("name", e.target.value)}
                aria-invalid={errors.name ? true : undefined}
              />
            </Field>
            <Field label="Kind" htmlFor={id("kind")} error={errors.kind}>
              <Select
                value={form.kind}
                onValueChange={(v) => set("kind", v as GridNodeKind)}
                disabled={kinds.length === 1}
              >
                <SelectTrigger id={id("kind")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {GRID_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {!isGenerator && (
            <>
              <Field
                label="Fed from"
                htmlFor={id("feed")}
                required
                error={errors.parentId}
              >
                <Select
                  value={form.parentId}
                  onValueChange={(v) => set("parentId", v)}
                >
                  <SelectTrigger id={id("feed")}>
                    <SelectValue placeholder="Pick the point that feeds it" />
                  </SelectTrigger>
                  <SelectContent>
                    {feeds.length === 0 && (
                      <SelectItem value={NO_FEED} disabled>
                        Add the generator first
                      </SelectItem>
                    )}
                    {feeds.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Cable (optional)"
                  htmlFor={id("cable")}
                  error={errors.cable}
                  help="Such as a 25 m extension reel."
                >
                  <Input
                    id={id("cable")}
                    value={form.cable}
                    maxLength={80}
                    onChange={(e) => set("cable", e.target.value)}
                  />
                </Field>
                <Field
                  label="Length (m)"
                  htmlFor={id("length")}
                  error={errors.cableLengthM}
                >
                  <Input
                    id={id("length")}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={form.cableLengthM}
                    onChange={(e) => set("cableLengthM", e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Conductor size (mm²)"
                  htmlFor={id("gauge")}
                  error={errors.cableGaugeMm2}
                  help="Printed on the cable, such as 1.5 or 2.5."
                >
                  <Input
                    id={id("gauge")}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={form.cableGaugeMm2}
                    onChange={(e) => set("cableGaugeMm2", e.target.value)}
                  />
                </Field>
                <Field
                  label="Rated amps"
                  htmlFor={id("amps")}
                  error={errors.cableRatedAmps}
                  help="From the cable's label. Blank shows 'rating unknown'."
                >
                  <Input
                    id={id("amps")}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={form.cableRatedAmps}
                    onChange={(e) => set("cableRatedAmps", e.target.value)}
                  />
                </Field>
              </div>
              {suggested !== null &&
                form.cableRatedAmps.trim() !== String(suggested) && (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    A {form.cableGaugeMm2} mm² cable is usually rated about{" "}
                    {suggested} A. Check its label.
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => set("cableRatedAmps", String(suggested))}
                    >
                      Use {suggested} A
                    </Button>
                  </p>
                )}

              <Field
                label="Adapter at the far end (optional)"
                htmlFor={id("adapter")}
                error={errors.adapter}
                help="Such as a 4-way multiplug."
              >
                <Input
                  id={id("adapter")}
                  value={form.adapter}
                  maxLength={80}
                  onChange={(e) => set("adapter", e.target.value)}
                />
              </Field>

              <div className="flex flex-col gap-4">
                <HaveField
                  label="The cable"
                  value={form.haveCable}
                  onChange={(v) => set("haveCable", v)}
                />
                {form.adapter.trim() !== "" && (
                  <HaveField
                    label="The adapter"
                    value={form.haveAdapter}
                    onChange={(v) => set("haveAdapter", v)}
                  />
                )}
              </div>
            </>
          )}

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                className="text-destructive sm:mr-auto"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                  onRemove();
                }}
              >
                Remove point
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add point"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Adds a point to the grid. Only an editor is shown it. */
export function AddPointButton({ feeds }: { feeds: FeedOption[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add a point</Button>
      <GridPointDialog
        key={feeds.map((f) => f.id).join(",")}
        open={open}
        onOpenChange={setOpen}
        feeds={feeds}
      />
    </>
  );
}

/** One Edit button for a point; Remove sits at the foot of its dialog. */
export function PointRowActions({
  point,
  feeds,
}: {
  point: EditablePoint;
  feeds: FeedOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [removing, startRemove] = React.useTransition();

  function confirmRemove() {
    startRemove(async () => {
      const result = await removeGridNodeAction({
        nodeId: point.id,
        expectedVersion: point.version,
      });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${point.name} removed`);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 px-2.5 text-[10px]"
        disabled={removing}
        onClick={() => setEditOpen(true)}
        aria-label={`Edit ${point.name}`}
      >
        {removing ? <Spinner size="sm" label="Removing…" /> : "Edit"}
      </Button>
      <GridPointDialog
        key={`${point.id}:${point.version}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={point}
        feeds={feeds}
        onRemove={() => setConfirming(true)}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${point.name}?`}
        description="It comes off this year's grid. Anything plugged in there is left off the grid until you plug it in somewhere else."
        confirmLabel="Remove point"
        destructive
        pending={removing}
        onConfirm={confirmRemove}
      />
    </>
  );
}

const HAVE_OPTIONS = [
  { value: "unchecked", label: "Not checked" },
  { value: "have", label: "Have it" },
  { value: "need", label: "Need to get" },
];

function haveValue(have: boolean | null): string {
  return have === null ? "unchecked" : have ? "have" : "need";
}

function haveFrom(value: string): boolean | null {
  return value === "unchecked" ? null : value === "have";
}

/** The camp has it, must get it, or nobody has checked yet. */
function HaveField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <SegmentedControl
        aria-label={label}
        options={HAVE_OPTIONS}
        value={haveValue(value)}
        onValueChange={(v) => onChange(haveFrom(v))}
      />
    </fieldset>
  );
}

/**
 * Have it or Need to get, for one cable or adapter, in one tap: it saves the
 * point with the version it was drawn from, and a failure is a toast.
 */
export function HaveToggle({
  point,
  which,
  name,
}: {
  point: EditablePoint;
  which: "cable" | "adapter";
  name: string;
}) {
  const router = useRouter();
  const current = which === "cable" ? point.haveCable : point.haveAdapter;
  const [value, setValue] = React.useState(current);
  const [pending, startTransition] = React.useTransition();

  function pick(next: boolean) {
    if (next === value) return;
    const before = value;
    setValue(next);
    startTransition(async () => {
      const result = await updateGridNodeAction({
        nodeId: point.id,
        expectedVersion: point.version,
        name: point.name,
        kind: point.kind,
        parentId: point.parentId,
        cable: point.cable,
        cableLengthM: point.cableLengthM,
        cableGaugeMm2: point.cableGaugeMm2,
        cableRatedAmps: point.cableRatedAmps,
        adapter: point.adapter,
        haveCable: which === "cable" ? next : point.haveCable,
        haveAdapter: which === "adapter" ? next : point.haveAdapter,
      });
      if (!result.ok) {
        setValue(before);
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={name}
      className="inline-grid w-full grid-cols-2 border border-[var(--color-choice-edge,var(--color-border))] bg-[var(--color-choice,var(--color-card))] page-sm:w-auto"
    >
      {(
        [
          [true, "Have it"],
          [false, "Need to get"],
        ] as const
      ).map(([have, label], i) => (
        <button
          key={label}
          type="button"
          aria-pressed={value === have}
          disabled={pending}
          onClick={() => pick(have)}
          className={cn(
            "h-[30px] whitespace-nowrap px-3 text-xs font-semibold",
            i === 1 &&
              "border-l border-[var(--color-choice-edge,var(--color-border))]",
            value === have &&
              "bg-[var(--color-pick,var(--color-card))] shadow-[inset_0_0_0_1px_var(--color-primary)]",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** The Select's value for "not on the grid". */
const OFF_GRID = "off";

/**
 * Where one load plugs in: a one-tap change on a list row, so its failure is
 * a toast and only this control spins.
 */
export function LoadPointSelect({
  loadId,
  loadName,
  nodeId,
  points,
}: {
  loadId: string;
  loadName: string;
  nodeId: string | null;
  points: FeedOption[];
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(nodeId ?? OFF_GRID);
  const [pending, startTransition] = React.useTransition();

  function change(next: string) {
    const before = value;
    setValue(next);
    startTransition(async () => {
      const result = await assignLoadAction({
        loadId,
        nodeId: next === OFF_GRID ? null : next,
      });
      if (!result.ok) {
        setValue(before);
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="flex w-full items-center gap-2 page-sm:w-auto">
      <Select value={value} onValueChange={change} disabled={pending}>
        <SelectTrigger
          aria-label={`Where ${loadName} plugs in`}
          className="h-8 w-full rounded-none border-[var(--color-choice-edge)] bg-[var(--color-choice)] text-[13px] font-medium page-sm:w-[216px]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={OFF_GRID}>Plug in at…</SelectItem>
          {points.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Spinner size="sm" label="Saving…" />}
    </span>
  );
}

/** Copies the most recent earlier year's grid into an empty year. */
export function CopyLastYearGridButton({ fromCycle }: { fromCycle: number }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await copyLastYearGridAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          const n = result.data.count;
          toast.success(
            `Copied ${n} point${n === 1 ? "" : "s"} from ${fromCycle}`,
          );
          router.refresh();
        })
      }
    >
      {pending ? <Spinner size="sm" label="Copying…" /> : <Copy aria-hidden />}
      Copy last year&apos;s grid
    </Button>
  );
}
