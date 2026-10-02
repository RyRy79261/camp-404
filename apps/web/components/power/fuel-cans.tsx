"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CAN_MATERIALS,
  EditFuelCanInput,
  FuelCanInput,
  type CanMaterial,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
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
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  addFuelCanAction,
  removeFuelCanAction,
  updateFuelCanAction,
} from "@/app/(console)/power/refuelling/actions";
import {
  CAN_MATERIAL_LABELS,
  cansText,
  formatNumber,
  materialText,
} from "@/lib/power-copy";

// The fuel can register (#255), as the owner approved it (option A,
// 2026-10-02: /home/ryan/camp404-night/design/fuel-register.html). One table
// in the printed sheet's order, so can 7 on the paper is row 7 here: #,
// Owner, Size, Material, Travels with, Filled by, Note, and Edit in the same
// right-hand slot. Above it one total per car (what each driver fills) and
// the cans not on a car yet. Below the list's 44rem each row is a card.
//
// "Filled by" is never picked: it is the driver of the car the can travels
// with, worked out on the server (fillingCar) and shown live in the dialog as
// the car changes. The four ticks (Filled, At fuel depot, At camp, Returned)
// are made on the printed sheet on site, never here. A reader (anyone but a
// captain or a Power & Lighting lead) gets the same list with no button.

/** A can as the list shows it. */
export interface CanView {
  id: string;
  version: number;
  /** Its number on the sheet: its place in the list, from 1. */
  number: number;
  ownerUserId: string | null;
  /** "Camp" for the camp's own can. */
  ownerName: string;
  sizeLitres: number;
  material: CanMaterial | null;
  /** The car's driver, while they drive this year. */
  travelsWithUserId: string | null;
  /** "Dana's Toyota", or null when not on a car yet. */
  carLabel: string | null;
  /** The car's driver by name: who fills it. Null is nobody yet. */
  filledBy: string | null;
  note: string | null;
}

/** One of this year's cars, as the totals and the dialog name it. */
export interface CarView {
  driverUserId: string;
  /** "Dana's Toyota". */
  label: string;
  /** "Dana van der Merwe". */
  driverName: string;
  /** "Dana", for "Dana fills them". */
  firstName: string;
  cans: number;
  litres: number;
}

export interface MemberOption {
  id: string;
  name: string;
}

const CAMP = "camp";
const NO_CAR = "none";

const EDGE = "border-[var(--color-choice-edge,var(--color-border))]";
const LINE = "border-foreground/10";
/** The list's container: a table from 44rem, cards below. */
const WIDE = "hidden @min-[44rem]/cans:block";
const NARROW = "@min-[44rem]/cans:hidden";
const COLS =
  "grid-cols-[24px_minmax(0,1fr)_48px_64px_minmax(0,1fr)_152px_minmax(0,1fr)_64px]";
const COLS_READ =
  "grid-cols-[24px_minmax(0,1fr)_48px_64px_minmax(0,1fr)_152px_minmax(0,1fr)]";

const litresText = (litres: number) => `${formatNumber(litres, 1)} L`;

/** "3 cans · 70 L", or "None". */
function countText(cans: number, litres: number): string {
  return cans === 0 ? "None" : `${cansText(cans)} · ${litresText(litres)}`;
}

function NotOnCar() {
  return (
    <span className="inline-block whitespace-nowrap border border-[oklch(0.85_0.13_85/0.5)] px-2 py-0.5 text-xs leading-4 font-semibold text-[oklch(0.85_0.13_85)]">
      Not on a car yet
    </span>
  );
}

function Travels({ can }: { can: CanView }) {
  return can.carLabel ? <>{can.carLabel}</> : <NotOnCar />;
}

function FilledBy({ can }: { can: CanView }) {
  return can.filledBy ? (
    <>{can.filledBy}</>
  ) : (
    <span className="text-muted-foreground">Nobody yet</span>
  );
}

// --- The totals above the list -----------------------------------------------

/** One total per car, then the cans on no car (amber when there are any). */
export function CarTotals({
  cars,
  notOnCar,
}: {
  cars: CarView[];
  notOnCar: { cans: number; litres: number };
}) {
  const cells = [
    ...cars.map((c) => ({
      key: c.driverUserId,
      label: c.label,
      value: countText(c.cans, c.litres),
      note:
        c.cans === 0
          ? "Nothing to fill"
          : `${c.firstName} fills ${c.cans === 1 ? "it" : "them"}`,
      warn: false,
    })),
    {
      key: NO_CAR,
      label: "Not on a car yet",
      value: countText(notOnCar.cans, notOnCar.litres),
      note:
        notOnCar.cans > 0 ? "Nobody fills these yet" : "Every can has a car",
      warn: notOnCar.cans > 0,
    },
  ];
  return (
    <ul
      aria-label="Cans per car"
      className={cn(
        "mb-4 grid grid-cols-1 border bg-card @min-[44rem]/cans:grid-cols-[repeat(var(--cells),minmax(0,1fr))]",
        EDGE,
      )}
      style={{ ["--cells" as string]: cells.length }}
    >
      {cells.map((c, i) => (
        <li
          key={c.key}
          aria-label={c.label}
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-3 py-2 @min-[44rem]/cans:block @min-[44rem]/cans:px-4 @min-[44rem]/cans:py-3",
            EDGE,
            i > 0 &&
              "border-t @min-[44rem]/cans:border-t-0 @min-[44rem]/cans:border-l",
            c.warn &&
              "shadow-[inset_3px_0_0_var(--color-warning)] @min-[44rem]/cans:shadow-[inset_0_3px_0_var(--color-warning)]",
          )}
        >
          <span className="col-start-1 row-start-1 truncate text-[13px] leading-4 font-semibold @min-[44rem]/cans:block @min-[44rem]/cans:text-[11px] @min-[44rem]/cans:font-normal @min-[44rem]/cans:uppercase @min-[44rem]/cans:tracking-[0.08em] @min-[44rem]/cans:text-muted-foreground">
            {c.label}
          </span>
          <span className="col-start-2 row-start-1 text-right text-sm leading-5 font-bold tabular-nums @min-[44rem]/cans:mt-1 @min-[44rem]/cans:block @min-[44rem]/cans:text-left @min-[44rem]/cans:text-lg @min-[44rem]/cans:leading-6">
            {c.value}
          </span>
          <span
            className={cn(
              "col-span-2 row-start-2 text-xs leading-4 @min-[44rem]/cans:mt-1 @min-[44rem]/cans:block",
              c.warn ? "text-[oklch(0.85_0.13_85)]" : "text-muted-foreground",
            )}
          >
            {c.note}
          </span>
        </li>
      ))}
    </ul>
  );
}

// --- The dialog --------------------------------------------------------------

/** Zod's first sentence for each field, by its name. */
function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues)
    out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

/** Who fills it, from the car chosen: never a pick of its own. */
export function FilledByBox({ car }: { car: CarView | null }) {
  return (
    <dl
      aria-label="Filled by"
      className={cn(
        "grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-3 border border-dashed bg-[color-mix(in_oklab,var(--color-card)_70%,black)] p-3 text-sm leading-5",
        EDGE,
      )}
    >
      <dt className="text-[13px] font-semibold">Filled by</dt>
      <dd className="m-0">
        {car ? (
          <>
            <b>{car.driverName}</b>, the driver
            <span className="mt-1 block text-xs leading-4 text-muted-foreground">
              Drivers fill the cans in their car before they leave home.
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Nobody yet: choose a car above.
          </span>
        )}
      </dd>
    </dl>
  );
}

export function FuelCanDialog({
  open,
  onOpenChange,
  can,
  number,
  cars,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The can to change; none adds one. */
  can: CanView | null;
  /** Its number on the sheet (a new can's: one past the last). */
  number: number;
  cars: CarView[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const initial = {
    owner: can?.ownerUserId ?? CAMP,
    size: String(can?.sizeLitres ?? 20),
    material: (can ? can.material : "plastic") as CanMaterial | null,
    car: can?.travelsWithUserId ?? NO_CAR,
    note: can?.note ?? "",
  };
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();
  const id = (n: string) => `${idBase}-${n}`;
  const title = can ? `Can ${number}` : "Add a can";
  const car = cars.find((c) => c.driverUserId === form.car) ?? null;
  // A member who owns a can but is not on the list (no longer approved) still
  // shows as its owner until someone picks another.
  const owners =
    can?.ownerUserId && !members.some((m) => m.id === can.ownerUserId)
      ? [...members, { id: can.ownerUserId, name: can.ownerName }]
      : members;

  function reset() {
    setForm(initial);
    setErrors({});
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function finish(message: string) {
    toast.success(message);
    close();
    router.refresh();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const size = Number(form.size);
    const fields = {
      ownerUserId: form.owner === CAMP ? null : form.owner,
      sizeLitres: form.size.trim() === "" || !Number.isFinite(size) ? 0 : size,
      material: form.material,
      travelsWithUserId: form.car === NO_CAR ? null : form.car,
      note: form.note,
    };
    const payload = can
      ? { ...fields, canId: can.id, expectedVersion: can.version }
      : fields;
    const check = (can ? EditFuelCanInput : FuelCanInput).safeParse(payload);
    if (!check.success) {
      const found = fieldErrors(check.error.issues);
      if (found.material) found.material = "Choose what it is made of.";
      setErrors(found);
      return;
    }
    setErrors({});
    startTransition(async () => {
      if (can) {
        const result = await updateFuelCanAction(payload);
        if (!result.ok) return setError(result.error);
        finish(`Can ${number} saved`);
      } else {
        const result = await addFuelCanAction(payload);
        if (!result.ok) return setError(result.error);
        finish(`Can ${result.data.number} added`);
      }
    });
  }

  function remove() {
    if (!can) return;
    setError(null);
    startTransition(async () => {
      const result = await removeFuelCanAction({
        canId: can.id,
        expectedVersion: can.version,
      });
      if (!result.ok) return setError(result.error);
      finish(`Can ${number} removed`);
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
        className="max-h-[90svh] overflow-y-auto sm:max-w-[480px]"
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {can
                ? "Change its owner, size, material, car or note."
                : `It goes on the list and the printed sheet as can ${number}.`}
            </DialogDescription>
          </DialogHeader>

          <Field
            label="Owner"
            htmlFor={id("owner")}
            help="A member, or Camp for a can the camp owns."
            error={errors.ownerUserId}
          >
            <Select
              value={form.owner}
              onValueChange={(v) => setForm((f) => ({ ...f, owner: v }))}
            >
              <SelectTrigger id={id("owner")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CAMP}>Camp</SelectItem>
                {owners.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Size" htmlFor={id("size")} error={errors.sizeLitres}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <Input
                  id={id("size")}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={250}
                  step="any"
                  value={form.size}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, size: e.target.value }))
                  }
                  aria-invalid={errors.sizeLitres ? true : undefined}
                />
                <span className="text-sm font-semibold">litres</span>
              </div>
            </Field>
            <Field
              label="Made of"
              htmlFor={id("material")}
              error={errors.material}
            >
              <Select
                value={form.material ?? undefined}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, material: v as CanMaterial }))
                }
              >
                <SelectTrigger
                  id={id("material")}
                  aria-invalid={errors.material ? true : undefined}
                >
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {CAN_MATERIALS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {CAN_MATERIAL_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            label="Travels with"
            htmlFor={id("car")}
            help="One of this year's cars in Transport."
            error={errors.travelsWithUserId}
          >
            <Select
              value={form.car}
              onValueChange={(v) => setForm((f) => ({ ...f, car: v }))}
            >
              <SelectTrigger id={id("car")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cars.map((c) => (
                  <SelectItem key={c.driverUserId} value={c.driverUserId}>
                    {c.label} · {c.driverName}
                  </SelectItem>
                ))}
                <SelectItem value={NO_CAR}>Not on a car yet</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <FilledByBox car={car} />

          <Field
            label="Note (optional)"
            htmlFor={id("note")}
            error={errors.note}
          >
            <Input
              id={id("note")}
              value={form.note}
              maxLength={80}
              placeholder="Green, dented lid"
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </Field>

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="pt-2">
            {can && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={remove}
                className="border-destructive/50 text-destructive sm:mr-auto"
              >
                Remove the can
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : can ? "Save the can" : "Add the can"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- The list ----------------------------------------------------------------

function EditButton({
  can,
  onEdit,
  wide,
}: {
  can: CanView;
  onEdit: (can: CanView) => void;
  wide?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(wide ? "h-10 w-full" : "h-8 w-16")}
      aria-label={`Edit can ${can.number}`}
      onClick={() => onEdit(can)}
    >
      Edit
    </Button>
  );
}

/**
 * The register: the car totals, then the list as a table (or cards), with
 * Add a can and one Edit per can for an editor, and nothing to press for a
 * reader. `members` and the dialog reach only an editor.
 */
export function FuelCanList({
  cans,
  cars,
  notOnCar,
  canEdit,
  members,
}: {
  cans: CanView[];
  cars: CarView[];
  notOnCar: { cans: number; litres: number };
  canEdit: boolean;
  members: MemberOption[];
}) {
  // The dialog open: "add", a can's id, or none.
  const [open, setOpen] = React.useState<string | null>(null);
  const editing = cans.find((c) => c.id === open) ?? null;
  const total = cans.reduce((sum, c) => sum + c.sizeLitres, 0);
  const meta = `${cansText(cans.length)} · ${litresText(total)} in all`;
  const add = canEdit ? (
    <Button
      variant="outline"
      size="sm"
      className="h-10 page-sm:h-8"
      onClick={() => setOpen("add")}
    >
      Add a can
    </Button>
  ) : null;

  return (
    <div className="@container/cans">
      <CarTotals cars={cars} notOnCar={notOnCar} />

      <section
        aria-label="Fuel cans"
        className={cn(
          "@min-[44rem]/cans:border @min-[44rem]/cans:bg-card",
          EDGE,
        )}
      >
        <div
          className={cn(
            "mb-3 flex items-center justify-between gap-4 @min-[44rem]/cans:mb-0 @min-[44rem]/cans:min-h-14 @min-[44rem]/cans:border-b @min-[44rem]/cans:px-4 @min-[44rem]/cans:py-3",
            LINE,
          )}
        >
          <div className="min-w-0">
            <h3 className="m-0 font-pixel text-xs leading-4 uppercase tracking-[0.2em] @min-[44rem]/cans:font-sans @min-[44rem]/cans:text-[15px] @min-[44rem]/cans:leading-5 @min-[44rem]/cans:font-semibold @min-[44rem]/cans:tracking-normal @min-[44rem]/cans:normal-case">
              Fuel cans
            </h3>
            <span className="mt-1 block text-xs leading-4 text-muted-foreground">
              {meta}
            </span>
          </div>
          {add}
        </div>

        {cans.length === 0 ? (
          <div
            className={cn(
              "flex flex-col gap-1 border border-dashed px-4 py-6 text-sm leading-5 @min-[44rem]/cans:border-0",
              EDGE,
            )}
          >
            <b>No cans yet.</b>
            <span className="text-[13px] text-muted-foreground">
              The jerry cans the camp takes, each with its owner and the car
              that brings it.
            </span>
          </div>
        ) : (
          <>
            <div role="table" aria-label="Fuel cans" className={WIDE}>
              <div
                role="row"
                className={cn(
                  "grid gap-x-3 px-4 py-2 text-xs leading-4 font-medium text-muted-foreground",
                  canEdit ? COLS : COLS_READ,
                )}
              >
                <span role="columnheader">#</span>
                <span role="columnheader">Owner</span>
                <span role="columnheader" className="text-right">
                  Size
                </span>
                <span role="columnheader">Material</span>
                <span role="columnheader">Travels with</span>
                <span role="columnheader">Filled by</span>
                <span role="columnheader">Note</span>
                {canEdit && (
                  <span role="columnheader" className="text-right">
                    Action
                  </span>
                )}
              </div>
              {cans.map((c) => (
                <div
                  key={c.id}
                  role="row"
                  aria-label={`Can ${c.number}`}
                  className={cn(
                    "grid min-h-14 items-center gap-x-3 border-t px-4 py-3 text-sm leading-5",
                    LINE,
                    canEdit ? COLS : COLS_READ,
                  )}
                >
                  <span role="cell" className="font-bold tabular-nums">
                    {c.number}
                  </span>
                  <span role="cell" className="min-w-0 font-semibold">
                    {c.ownerName}
                  </span>
                  <span
                    role="cell"
                    className="text-right whitespace-nowrap tabular-nums"
                  >
                    {litresText(c.sizeLitres)}
                  </span>
                  <span
                    role="cell"
                    className={cn(!c.material && "text-muted-foreground")}
                  >
                    {materialText(c.material)}
                  </span>
                  <span role="cell" className="min-w-0">
                    <Travels can={c} />
                  </span>
                  <span role="cell" className="min-w-0">
                    <FilledBy can={c} />
                  </span>
                  <span role="cell" className="min-w-0 text-muted-foreground">
                    {c.note}
                  </span>
                  {canEdit && (
                    <span role="cell" className="flex justify-end">
                      <EditButton can={c} onEdit={(x) => setOpen(x.id)} />
                    </span>
                  )}
                </div>
              ))}
              <p
                className={cn(
                  "m-0 border-t px-4 py-3 text-[13px] leading-5 text-muted-foreground",
                  LINE,
                )}
              >
                Filled by is the driver of the car the can travels with.
                {canEdit && " To change it, choose another car in Edit."}
              </p>
            </div>

            <ul
              aria-label="Fuel cans"
              className={cn(NARROW, "flex flex-col gap-2")}
            >
              {cans.map((c) => (
                <li
                  key={c.id}
                  aria-label={`Can ${c.number}`}
                  className={cn("border bg-card px-4 py-3", EDGE)}
                >
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold">
                      Can {c.number}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {litresText(c.sizeLitres)} · {materialText(c.material)}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-[96px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 text-[13px] leading-5">
                    <dt className="text-muted-foreground">Owner</dt>
                    <dd className="m-0">{c.ownerName}</dd>
                    <dt className="text-muted-foreground">Travels with</dt>
                    <dd className="m-0">
                      <Travels can={c} />
                    </dd>
                    <dt className="text-muted-foreground">Filled by</dt>
                    <dd className="m-0">
                      <FilledBy can={c} />
                    </dd>
                    {c.note && (
                      <>
                        <dt className="text-muted-foreground">Note</dt>
                        <dd className="m-0">{c.note}</dd>
                      </>
                    )}
                  </dl>
                  {canEdit && (
                    <div className={cn("mt-3 border-t pt-3", EDGE)}>
                      <EditButton can={c} onEdit={(x) => setOpen(x.id)} wide />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {canEdit && (
        <FuelCanDialog
          // A fresh form for each can and each version, so a stale dialog
          // never writes over a newer change.
          key={editing ? `${editing.id}:${editing.version}` : `add:${open}`}
          open={open !== null}
          onOpenChange={(next) => {
            if (!next) setOpen(null);
          }}
          can={editing}
          number={editing ? editing.number : cans.length + 1}
          cars={cars}
          members={members}
        />
      )}
    </div>
  );
}
