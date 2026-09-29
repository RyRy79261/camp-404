"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  CAR_MESSAGE_BODY_MAX,
  CAR_MESSAGE_TITLE_MAX,
  CarMessageInput,
  MAX_SEATS_OFFERED,
  TRAILER_NAME_MAX,
  TRAILER_NOTES_MAX,
  TrailerInput,
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
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import {
  addRiderAction,
  addTrailerAction,
  answerLiftRequestAction,
  removeRiderAction,
  removeTrailerAction,
  requestLiftAction,
  sendCarMessageAction,
  setSeatsAction,
  setTowAction,
  updateTrailerAction,
  withdrawLiftRequestAction,
} from "@/app/(console)/transport/actions";

// The Transport page's controls (#270). Composed as the power load list's: a
// dialog for anything typed (its problems shown inline beside the field), a
// toast for a one-tap change on a row (only the control that was used spins),
// and for someone who may not use a control, the control present but disabled
// and described by the page's one refusal line. The server re-checks every
// write; nothing here is the boundary.

/** A car a select can offer. */
export interface CarOption {
  driverUserId: string;
  label: string;
}

const ANY_CAR = "any";
const NO_CAR = "none";

function refusalProps(allowed: boolean, name: string, refusalId?: string) {
  return allowed || !refusalId
    ? {}
    : {
        "aria-label": `${name} — not available to you`,
        "aria-describedby": refusalId,
      };
}

/** Run a one-tap action: a toast on failure, a refresh on success. */
function useRowAction() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = React.useCallback(
    (action: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
      start(async () => {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error ?? "That didn't work. Try again.");
          return;
        }
        toast.success(success);
        router.refresh();
      }),
    [router],
  );
  return [pending, run] as const;
}

// --- Seats and riders ----------------------------------------------------------

/** How many seats a car offers, for its driver or a transport editor. */
export function SeatsControl({
  driverUserId,
  seatsOffered,
}: {
  driverUserId: string;
  seatsOffered: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(
    seatsOffered === null ? "" : String(seatsOffered),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const id = `seats-${driverUserId}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const seats = Number(value);
    if (value.trim() === "" || !Number.isInteger(seats) || seats < 0) {
      setError("Seats are a whole number, 0 or more.");
      return;
    }
    setError(null);
    start(async () => {
      const result = await setSeatsAction({
        driverUserId,
        seatsOffered: seats,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Seats saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1" noValidate>
      <Field label="Seats you offer" htmlFor={id} error={error ?? undefined}>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SEATS_OFFERED}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            className="w-24"
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? <Spinner size="sm" label="Saving…" /> : null}
            Save seats
          </Button>
        </div>
      </Field>
    </form>
  );
}

/** A rider's name, with a remove button for whoever may take them out. */
export function RiderChip({
  driverUserId,
  rider,
  canRemove,
}: {
  driverUserId: string;
  rider: { userId: string; name: string };
  canRemove: boolean;
}) {
  const [pending, run] = useRowAction();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs">
      {rider.name}
      {canRemove && (
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label={`Take ${rider.name} out of this car`}
          disabled={pending}
          onClick={() =>
            run(
              () =>
                removeRiderAction({ driverUserId, memberUserId: rider.userId }),
              `${rider.name} is out of the car`,
            )
          }
        >
          {pending ? (
            <Spinner size="sm" label="Removing…" />
          ) : (
            <X className="h-3 w-3" aria-hidden />
          )}
        </button>
      )}
    </span>
  );
}

/** A rider takes themself out of the car they ride in. */
export function LeaveCarButton({
  driverUserId,
  memberUserId,
}: {
  driverUserId: string;
  memberUserId: string;
}) {
  const [pending, run] = useRowAction();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(
          () => removeRiderAction({ driverUserId, memberUserId }),
          "You left the car",
        )
      }
    >
      {pending ? <Spinner size="sm" label="Leaving…" /> : null}
      Leave this car
    </Button>
  );
}

// --- Lift requests -------------------------------------------------------------

/** A member asks for a lift, in one car or any car. */
export function AskForLift({ cars }: { cars: CarOption[] }) {
  const router = useRouter();
  const [car, setCar] = React.useState(ANY_CAR);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await requestLiftAction({
        driverUserId: car === ANY_CAR ? null : car,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Lift asked for");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 page-sm:flex-row page-sm:items-end"
    >
      <Field
        label="Which car?"
        htmlFor="ask-car"
        error={error ?? undefined}
        className="page-sm:w-72"
      >
        <Select value={car} onValueChange={setCar}>
          <SelectTrigger id="ask-car">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_CAR}>Any car</SelectItem>
            {cars.map((c) => (
              <SelectItem key={c.driverUserId} value={c.driverUserId}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner size="sm" label="Asking…" /> : null}
        Ask for a lift
      </Button>
    </form>
  );
}

export function WithdrawRequestButton() {
  const [pending, run] = useRowAction();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(() => withdrawLiftRequestAction(), "Request taken back")
      }
    >
      {pending ? <Spinner size="sm" label="Taking back…" /> : null}
      Take back my request
    </Button>
  );
}

/** Accept (seat them in the car they asked for) or decline a request. */
export function RequestActions({
  memberUserId,
  name,
  canAccept,
}: {
  memberUserId: string;
  name: string;
  canAccept: boolean;
}) {
  const [accepting, runAccept] = useRowAction();
  const [declining, runDecline] = useRowAction();
  const busy = accepting || declining;
  return (
    <span className="flex items-center justify-end gap-1">
      {canAccept && (
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            runAccept(
              () => answerLiftRequestAction({ memberUserId, accept: true }),
              `${name} is in the car`,
            )
          }
          aria-label={`Accept ${name}`}
        >
          {accepting ? (
            <Spinner size="sm" label="Accepting…" />
          ) : (
            <Check aria-hidden />
          )}
          Accept
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() =>
          runDecline(
            () => answerLiftRequestAction({ memberUserId, accept: false }),
            "Request declined",
          )
        }
        aria-label={`Decline ${name}`}
      >
        {declining ? <Spinner size="sm" label="Declining…" /> : null}
        Decline
      </Button>
    </span>
  );
}

/** A transport editor puts a member in a car of their choosing. */
export function PlaceInCar({
  memberUserId,
  name,
  cars,
}: {
  memberUserId: string;
  name: string;
  cars: CarOption[];
}) {
  const [car, setCar] = React.useState<string>("");
  const [pending, run] = useRowAction();
  return (
    <span className="flex items-center justify-end gap-1">
      <Select value={car} onValueChange={setCar}>
        <SelectTrigger
          className="h-8 w-44 text-xs"
          aria-label={`Car for ${name}`}
        >
          <SelectValue placeholder="Pick a car" />
        </SelectTrigger>
        <SelectContent>
          {cars.map((c) => (
            <SelectItem key={c.driverUserId} value={c.driverUserId}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={!car || pending}
        onClick={() =>
          run(
            () => addRiderAction({ driverUserId: car, memberUserId }),
            `${name} is in the car`,
          )
        }
        aria-label={`Put ${name} in the car`}
      >
        {pending ? <Spinner size="sm" label="Adding…" /> : null}
        Put in car
      </Button>
    </span>
  );
}

// --- Trailers ------------------------------------------------------------------

export interface EditableTrailer {
  id: string;
  name: string;
  notes: string | null;
  version: number;
  towedByUserId: string | null;
}

function TrailerDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EditableTrailer;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(editing?.name ?? "");
  const [notes, setNotes] = React.useState(editing?.notes ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const check = TrailerInput.safeParse({ name, notes });
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        next[String(issue.path[0])] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    start(async () => {
      const result = editing
        ? await updateTrailerAction({
            trailerId: editing.id,
            expectedVersion: editing.version,
            name,
            notes,
          })
        : await addTrailerAction({ name, notes });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Trailer saved" : "Trailer added");
      onOpenChange(false);
      if (!editing) {
        setName("");
        setNotes("");
      }
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit trailer" : "Add a trailer"}
            </DialogTitle>
            <DialogDescription>
              A trailer the camp has this year. Pick the car that tows it on the
              list.
            </DialogDescription>
          </DialogHeader>
          <Field label="Name" htmlFor="trailer-name" error={errors.name}>
            <Input
              id="trailer-name"
              value={name}
              maxLength={TRAILER_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? true : undefined}
            />
          </Field>
          <Field
            label="Notes (optional)"
            htmlFor="trailer-notes"
            error={errors.notes}
            help="What it carries, or where to collect it."
          >
            <Textarea
              id="trailer-notes"
              rows={3}
              value={notes}
              maxLength={TRAILER_NOTES_MAX}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner size="sm" label="Saving…" /> : null}
              {editing ? "Save trailer" : "Add trailer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddTrailerButton({
  canEdit,
  refusalId,
}: {
  canEdit: boolean;
  refusalId: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        {...refusalProps(canEdit, "Add trailer", refusalId)}
      >
        <Plus aria-hidden />
        Add trailer
      </Button>
      {canEdit && <TrailerDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

/** Which car tows a trailer: the cars that can tow, or none. */
export function TowSelect({
  trailer,
  cars,
  canEdit,
  refusalId,
}: {
  trailer: EditableTrailer;
  cars: CarOption[];
  canEdit: boolean;
  refusalId: string;
}) {
  const [pending, run] = useRowAction();
  const value = trailer.towedByUserId ?? NO_CAR;
  return (
    <span className="inline-flex items-center gap-1">
      <Select
        value={value}
        disabled={!canEdit || pending}
        onValueChange={(next) =>
          run(
            () =>
              setTowAction({
                trailerId: trailer.id,
                expectedVersion: trailer.version,
                driverUserId: next === NO_CAR ? null : next,
              }),
            next === NO_CAR ? "Trailer has no car" : "Tow saved",
          )
        }
      >
        <SelectTrigger
          className="h-8 w-48 text-xs"
          aria-label={
            canEdit
              ? `Car towing ${trailer.name}`
              : `Car towing ${trailer.name} — not available to you`
          }
          aria-describedby={canEdit ? undefined : refusalId}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CAR}>No car yet</SelectItem>
          {cars.map((c) => (
            <SelectItem key={c.driverUserId} value={c.driverUserId}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Spinner size="sm" label="Saving…" />}
    </span>
  );
}

export function TrailerRowActions({
  trailer,
  canEdit,
  refusalId,
}: {
  trailer: EditableTrailer;
  canEdit: boolean;
  refusalId: string;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [removing, startRemove] = React.useTransition();

  function confirmRemove() {
    startRemove(async () => {
      const result = await removeTrailerAction({
        trailerId: trailer.id,
        expectedVersion: trailer.version,
      });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Trailer removed");
      router.refresh();
    });
  }

  return (
    <span className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || removing}
        onClick={() => setEditOpen(true)}
        aria-label={`Edit ${trailer.name}`}
        {...refusalProps(canEdit, `Edit ${trailer.name}`, refusalId)}
      >
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={!canEdit || removing}
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${trailer.name}`}
        {...refusalProps(canEdit, `Remove ${trailer.name}`, refusalId)}
      >
        {removing ? (
          <Spinner size="sm" label="Removing…" />
        ) : (
          <Trash2 aria-hidden />
        )}
      </Button>
      {canEdit && (
        <>
          <TrailerDialog
            key={`${trailer.id}:${trailer.version}`}
            open={editOpen}
            onOpenChange={setEditOpen}
            editing={trailer}
          />
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={`Remove ${trailer.name}?`}
            description="It comes off this year's list, and off the car that tows it."
            confirmLabel="Remove trailer"
            destructive
            pending={removing}
            onConfirm={confirmRemove}
          />
        </>
      )}
    </span>
  );
}

// --- The car message -------------------------------------------------------------

/**
 * A driver writes to the people in their car. The form sends a title and a
 * message only; the server finds the car and its riders itself.
 */
export function CarMessageButton({ riders }: { riders: number }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function reset() {
    setTitle("");
    setBody("");
    setErrors({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const check = CarMessageInput.safeParse({ title, body });
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        next[String(issue.path[0])] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    start(async () => {
      const result = await sendCarMessageAction(check.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const n = result.data.recipientCount;
      toast.success(`Sent to ${n} ${n === 1 ? "person" : "people"}`);
      reset();
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        variant="outline"
        disabled={riders === 0}
        onClick={() => setOpen(true)}
      >
        <MessageSquare aria-hidden />
        Message my car
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          if (!next) reset();
          setOpen(next);
        }}
      >
        <DialogContent>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Message my car</DialogTitle>
              <DialogDescription>
                Goes to the {riders === 1 ? "person" : `${riders} people`}{" "}
                riding with you this year, in their inbox and as a push.
              </DialogDescription>
            </DialogHeader>
            <Field label="Title" htmlFor="car-title" error={errors.title}>
              <Input
                id="car-title"
                value={title}
                maxLength={CAR_MESSAGE_TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                aria-invalid={errors.title ? true : undefined}
              />
            </Field>
            <Field label="Message" htmlFor="car-body" error={errors.body}>
              <Textarea
                id="car-body"
                rows={5}
                value={body}
                maxLength={CAR_MESSAGE_BODY_MAX}
                onChange={(e) => setBody(e.target.value)}
                aria-invalid={errors.body ? true : undefined}
              />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner size="sm" label="Sending…" /> : null}
                Send to my car
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
