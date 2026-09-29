"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { suggestedAmpsForGauge } from "@camp404/core";
import {
  EditGridNodeInput,
  GRID_NODE_KINDS,
  GridNodeInput,
  type GridNodeKind,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  addGridNodeAction,
  assignLoadAction,
  copyLastYearGridAction,
  removeGridNodeAction,
  updateGridNodeAction,
} from "@/app/(console)/power/grid/actions";
import { GRID_KIND_LABELS } from "@/lib/power-copy";

// The grid plan's controls (#256), laid out as the load list's: Add opens a
// dialog, each point has Edit and Remove, and for a viewer who may not edit
// every control is PRESENT BUT DISABLED and describes to the page's one
// refusal line. The cable's rating is typed from its label; the form can
// suggest a usual rating for a conductor size, but only fills it when asked,
// so the app never guesses a rating on its own.

function refusalProps(canEdit: boolean, name: string, refusalId: string) {
  return canEdit
    ? { "aria-label": name }
    : {
        "aria-label": `${name} — not available to you`,
        "aria-describedby": refusalId,
      };
}

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
  haveCable: boolean;
  haveAdapter: boolean;
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
  haveCable: boolean;
  haveAdapter: boolean;
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
    haveCable: point?.haveCable ?? true,
    haveAdapter: point?.haveAdapter ?? true,
  };
}

function GridPointDialog({
  open,
  onOpenChange,
  editing,
  feeds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EditablePoint;
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
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
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
                placeholder="Main junction"
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
                >
                  <Input
                    id={id("cable")}
                    value={form.cable}
                    maxLength={80}
                    placeholder="25 m extension reel"
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
              >
                <Input
                  id={id("adapter")}
                  value={form.adapter}
                  maxLength={80}
                  placeholder="4-way multiplug"
                  onChange={(e) => set("adapter", e.target.value)}
                />
              </Field>

              <div className="grid gap-2 sm:grid-cols-2">
                <AckRow
                  checked={form.haveCable}
                  onCheckedChange={(v) => set("haveCable", v === true)}
                >
                  We have the cable
                </AckRow>
                <AckRow
                  checked={form.haveAdapter}
                  onCheckedChange={(v) => set("haveAdapter", v === true)}
                >
                  We have the adapter
                </AckRow>
              </div>
            </>
          )}

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

export function AddPointButton({
  canEdit,
  refusalId,
  feeds,
}: {
  canEdit: boolean;
  refusalId: string;
  feeds: FeedOption[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        {...refusalProps(canEdit, "Add point", refusalId)}
      >
        <Plus aria-hidden />
        Add point
      </Button>
      {canEdit && (
        <GridPointDialog
          key={feeds.map((f) => f.id).join(",")}
          open={open}
          onOpenChange={setOpen}
          feeds={feeds}
        />
      )}
    </>
  );
}

/** Edit and Remove for one point. Only the control that was used spins. */
export function PointRowActions({
  point,
  canEdit,
  refusalId,
  feeds,
}: {
  point: EditablePoint;
  canEdit: boolean;
  refusalId: string;
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
    <span className="flex shrink-0 items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || removing}
        onClick={() => setEditOpen(true)}
        {...refusalProps(canEdit, `Edit ${point.name}`, refusalId)}
      >
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || removing}
        onClick={() => setConfirming(true)}
        {...refusalProps(canEdit, `Remove ${point.name}`, refusalId)}
      >
        {removing ? (
          <Spinner size="sm" label="Removing…" />
        ) : (
          <Trash2 aria-hidden />
        )}
      </Button>
      {canEdit && (
        <>
          <GridPointDialog
            key={`${point.id}:${point.version}`}
            open={editOpen}
            onOpenChange={setEditOpen}
            editing={point}
            feeds={feeds}
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
      )}
    </span>
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
    <span className="flex items-center gap-2">
      <Select value={value} onValueChange={change} disabled={pending}>
        <SelectTrigger
          aria-label={`Where ${loadName} plugs in`}
          className="min-w-44"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={OFF_GRID}>Not on the grid yet</SelectItem>
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
export function CopyLastYearGridButton({
  fromCycle,
  canEdit,
  refusalId,
}: {
  fromCycle: number;
  canEdit: boolean;
  refusalId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      disabled={!canEdit || pending}
      {...refusalProps(canEdit, "Copy last year's grid", refusalId)}
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
