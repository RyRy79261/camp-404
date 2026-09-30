"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListPlus, Pencil, Plus, Trash2 } from "lucide-react";
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

// The readiness page's controls (#257), laid out as the other power pages':
// buttons on each row, a dialog for what needs typing, and for a viewer who
// may not edit every control PRESENT BUT DISABLED, describing to the page's
// one refusal line. A tick is a one-tap change: its failure is a toast.

function refusalProps(canEdit: boolean, name: string, refusalId: string) {
  return canEdit
    ? { "aria-label": name }
    : {
        "aria-label": `${name} — not available to you`,
        "aria-describedby": refusalId,
      };
}

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
  canEdit,
  refusalId,
}: {
  generatorId: string;
  model: string;
  canEdit: boolean;
  refusalId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      disabled={!canEdit || pending}
      {...refusalProps(canEdit, `Start the checklist for ${model}`, refusalId)}
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
}: {
  item: EditableItem;
  members: MemberOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      <DialogContent className="sm:max-w-lg">
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
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One item's tick, Edit and Remove. Only the control that was used spins. */
function useItemControls({
  item,
  members,
  canEdit,
  refusalId,
}: {
  item: EditableItem;
  members: MemberOption[];
  canEdit: boolean;
  refusalId: string;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [ticking, startTick] = React.useTransition();
  const [removing, startRemove] = React.useTransition();
  const busy = ticking || removing;

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
      toast.success("Item removed");
      router.refresh();
    });
  }

  return {
    tick: (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        {ticking ? (
          <Spinner size="sm" label="Saving…" />
        ) : (
          <Checkbox
            checked={item.done}
            disabled={!canEdit || busy}
            onCheckedChange={(v) => tick(v === true)}
            {...refusalProps(
              canEdit,
              item.done ? `${item.label}: done` : `${item.label}: not done`,
              refusalId,
            )}
          />
        )}
      </span>
    ),
    actions: (
      <span className="flex shrink-0 items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={!canEdit || busy}
          onClick={() => setEditOpen(true)}
          {...refusalProps(canEdit, `Edit ${item.label}`, refusalId)}
        >
          <Pencil aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={!canEdit || busy}
          onClick={() => setConfirming(true)}
          {...refusalProps(canEdit, `Remove ${item.label}`, refusalId)}
        >
          {removing ? (
            <Spinner size="sm" label="Removing…" />
          ) : (
            <Trash2 aria-hidden />
          )}
        </Button>
        {canEdit && (
          <>
            <ItemDialog
              key={`${item.id}:${item.version}`}
              item={item}
              members={members}
              open={editOpen}
              onOpenChange={setEditOpen}
            />
            <ConfirmDialog
              open={confirming}
              onOpenChange={setConfirming}
              title={`Remove "${item.label}"?`}
              description="It comes off this generator's checklist for this year."
              confirmLabel="Remove item"
              destructive
              pending={removing}
              onConfirm={confirmRemove}
            />
          </>
        )}
      </span>
    ),
  };
}

/** A row of the checklist: its tick, its words, and its buttons. */
export function ReadinessItemRow({
  item,
  members,
  canEdit,
  refusalId,
  children,
}: {
  item: EditableItem;
  members: MemberOption[];
  canEdit: boolean;
  refusalId: string;
  /** The item's words and details, drawn on the server. */
  children: React.ReactNode;
}) {
  const parts = useItemControls({ item, members, canEdit, refusalId });
  return (
    <li aria-label={item.label} className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5">{parts.tick}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
      {parts.actions}
    </li>
  );
}

export function AddReadinessItemForm({
  generatorId,
  canEdit,
  refusalId,
}: {
  generatorId: string;
  canEdit: boolean;
  refusalId: string;
}) {
  const router = useRouter();
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
      toast.success("Item added");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 px-4 py-3 page-sm:flex-row page-sm:items-start"
      noValidate
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={`${idBase}-label`} className="sr-only">
          Another item
        </label>
        <Input
          id={`${idBase}-label`}
          value={label}
          maxLength={80}
          placeholder="Another item, such as 'Borrow the trailer'"
          disabled={!canEdit}
          onChange={(e) => setLabel(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={canEdit ? undefined : refusalId}
        />
        {error && (
          <p className="text-xs font-medium text-destructive">{error}</p>
        )}
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={!canEdit || pending}
        {...refusalProps(canEdit, "Add item", refusalId)}
      >
        <Plus aria-hidden />
        {pending ? "Adding…" : "Add item"}
      </Button>
    </form>
  );
}

// --- The work plan ------------------------------------------------------------

export function AddWorkPlanButton({
  fromCycle,
  canEdit,
  refusalId,
}: {
  /** The year it copies from, or null for the template. */
  fromCycle: number | null;
  canEdit: boolean;
  refusalId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const name =
    fromCycle === null
      ? "Put the work plan on the task board"
      : `Copy ${fromCycle}'s work plan to the task board`;
  return (
    <Button
      disabled={!canEdit || pending}
      {...refusalProps(canEdit, name, refusalId)}
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

export function SharingForm({
  agreement,
  generators,
  proposedTheirPct,
  canEdit,
  refusalId,
}: {
  agreement: SharingValues | null;
  generators: { id: string; label: string }[];
  /** Their share from each camp's kWh, to one place. */
  proposedTheirPct: number;
  canEdit: boolean;
  refusalId: string;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState({
    partnerCamp: agreement?.partnerCamp ?? "",
    contactRole: agreement?.contactRole ?? "",
    generatorSource:
      agreement?.generatorSource ?? ("ours" as ShareGeneratorSource),
    generatorId: agreement?.generatorId ?? generators[0]?.id ?? NO_GENERATOR,
    theirGenerator: agreement?.theirGenerator ?? "",
    partnerFuelPct:
      agreement?.partnerFuelPct != null ? String(agreement.partnerFuelPct) : "",
    watchCover: agreement?.watchCover ?? "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);
  const [removing, startRemove] = React.useTransition();
  const idBase = React.useId();
  const id = (n: string) => `${idBase}-${n}`;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const locked = !canEdit;

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

  const describe = locked ? { "aria-describedby": refusalId } : {};

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 page-sm:grid-cols-2">
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
            disabled={locked}
            onChange={(e) => set("partnerCamp", e.target.value)}
            {...describe}
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
            disabled={locked}
            onChange={(e) => set("contactRole", e.target.value)}
            {...describe}
          />
        </Field>
      </div>

      <div className="grid gap-4 page-sm:grid-cols-2">
        <Field label="Whose generator" htmlFor={id("source")}>
          <Select
            value={form.generatorSource}
            onValueChange={(v) =>
              set("generatorSource", v as ShareGeneratorSource)
            }
            disabled={locked}
          >
            <SelectTrigger id={id("source")} {...describe}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHARE_GENERATOR_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SOURCE_LABELS[s]}
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
              disabled={locked}
            >
              <SelectTrigger id={id("gen")} {...describe}>
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
              disabled={locked}
              onChange={(e) => set("theirGenerator", e.target.value)}
              {...describe}
            />
          </Field>
        )}
      </div>

      <Field
        label="Their share of the fuel (%)"
        htmlFor={id("pct")}
        error={errors.partnerFuelPct}
        help={`Blank uses ${proposedTheirPct}%, their share of the energy from the load list's neighbour loads.`}
      >
        <Input
          id={id("pct")}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="any"
          value={form.partnerFuelPct}
          placeholder={String(proposedTheirPct)}
          disabled={locked}
          onChange={(e) => set("partnerFuelPct", e.target.value)}
          className="page-sm:max-w-40"
          {...describe}
        />
      </Field>

      <Field
        label="Who covers which watches"
        htmlFor={id("watch")}
        error={errors.watchCover}
        help="Camps and times, such as 'They cover 00:00–08:00'. No names or phone numbers."
      >
        <Textarea
          id={id("watch")}
          value={form.watchCover}
          maxLength={300}
          rows={2}
          disabled={locked}
          onChange={(e) => set("watchCover", e.target.value)}
          {...describe}
        />
      </Field>

      <ServerError error={error} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={locked || pending}
          {...refusalProps(canEdit, "Save agreement", refusalId)}
        >
          {pending ? "Saving…" : "Save agreement"}
        </Button>
        {agreement && (
          <Button
            type="button"
            variant="ghost"
            disabled={locked || removing}
            onClick={() => setConfirming(true)}
            {...refusalProps(canEdit, "Remove agreement", refusalId)}
          >
            <Trash2 aria-hidden />
            Remove agreement
          </Button>
        )}
      </div>
      {canEdit && agreement && (
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
    </form>
  );
}
