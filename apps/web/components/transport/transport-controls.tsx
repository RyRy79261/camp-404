"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { TextareaWithCount } from "@camp404/ui/components/textarea-with-count";
import { toast } from "@camp404/ui/components/toast";
import { CHOICE_OFF, CHOICE_ON } from "@camp404/ui/lib/choice";
import { cn } from "@camp404/ui/lib/utils";
import {
  addTrailerAction,
  answerLiftRequestAction,
  removeRiderAction,
  requestLiftAction,
  sendCarMessageAction,
  setSeatsAction,
  updateTrailerAction,
  withdrawLiftRequestAction,
} from "@/app/(console)/transport/actions";
import { listWords } from "@/lib/transport-view";

// The Transport page's and My lift's small controls (#270), restyled to the
// owner's approved Option A (2026-10-01). A dialog for anything typed (its
// problems inline beside the field), a toast for a one-tap change on a row
// (only the pressed control spins). Someone who may not use a control never
// gets it: the page leaves it out. The server re-checks every write.

type Result = { ok: true } | { ok: false; error: string };

/** One row action's width (the mock-up's 128px slot), and its phone form. */
export const ROW_ACTION = "h-8 w-32";
export const ROW_ACTION_PHONE = "h-10 w-full";
/** A quiet text button: no border, muted until hovered. */
export const QUIET =
  "h-8 px-2 font-sans text-[13px] font-semibold tracking-normal normal-case text-muted-foreground hover:bg-transparent hover:text-foreground";

/** Run a one-tap action: a toast on failure, a refresh on success. */
export function useRowAction() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = React.useCallback(
    (action: () => Promise<Result>, success: string) =>
      start(async () => {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(success);
        router.refresh();
      }),
    [router],
  );
  return [pending, run] as const;
}

// --- A list of choices (the panel under a row) ---------------------------------

export interface PanelChoice {
  value: string;
  label: string;
  description?: string | null;
  /** The short fact on the right ("2 seats free"). */
  right?: string | null;
}

/** A radio list in the choice look: one picked, arrows move between them. */
export function ChoiceList({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: PanelChoice[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const picked = choices.findIndex((c) => c.value === value);
  function move(index: number) {
    const target = (index + choices.length) % choices.length;
    const next = choices[target];
    if (!next) return;
    onChange(next.value);
    refs.current[target]?.focus();
  }
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {choices.map((c, i) => {
        const on = c.value === value;
        return (
          <button
            key={c.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (picked === -1 && i === 0) ? 0 : -1}
            onClick={() => move(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                move(i + 1);
              } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                move(i - 1);
              }
            }}
            className={cn(
              "flex items-center gap-3 border p-3 text-left font-sans tracking-normal normal-case focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? CHOICE_ON : CHOICE_OFF,
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-4 w-4 shrink-0 rounded-full border-2",
                on ? "border-primary bg-primary" : "border-muted-foreground",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-5 font-semibold">
                {c.label}
              </span>
              {c.description && (
                <span className="block text-xs leading-4 text-muted-foreground">
                  {c.description}
                </span>
              )}
            </span>
            {c.right && (
              <span className="shrink-0 text-[13px] whitespace-nowrap text-muted-foreground">
                {c.right}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- Your lift: rider and member -------------------------------------------------

/** A rider takes themself out of the car they ride in. */
export function LeaveCarButton({
  driverUserId,
  memberUserId,
  className,
}: {
  driverUserId: string;
  memberUserId: string;
  className?: string;
}) {
  const [pending, run] = useRowAction();
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("h-8", className)}
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

export function WithdrawRequestButton() {
  const [pending, run] = useRowAction();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={QUIET}
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

const ANY_CAR = "any";

/**
 * A member asks for a lift: a car with free seats, or any car. Nothing is
 * picked to start with, so one tap never sends a vague request.
 */
export function AskForLift({
  cars,
}: {
  cars: { driverUserId: string; label: string }[];
}) {
  const router = useRouter();
  const [car, setCar] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const errorId = React.useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!car) {
      setError("Choose a car, or Any car.");
      return;
    }
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
      noValidate
      className="flex w-full max-w-[420px] flex-col gap-2"
    >
      <div className="flex flex-col gap-2 page-sm:flex-row">
        <Select value={car} onValueChange={setCar}>
          <SelectTrigger
            aria-label="Which car"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="h-10 min-w-0 flex-1 font-sans tracking-normal normal-case page-sm:h-8"
          >
            <SelectValue placeholder="Choose a car" />
          </SelectTrigger>
          <SelectContent>
            {cars.map((c) => (
              <SelectItem key={c.driverUserId} value={c.driverUserId}>
                {c.label}
              </SelectItem>
            ))}
            <SelectItem value={ANY_CAR}>Any car</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="submit"
          size="sm"
          className="h-10 page-sm:h-8"
          disabled={pending}
        >
          {pending ? <Spinner size="sm" label="Asking…" /> : null}
          Ask for a lift
        </Button>
      </div>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-left text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </form>
  );
}

// --- Your car: the driver ---------------------------------------------------------

/** Accept (seat them in this car) or decline someone asking to ride. */
export function AnswerRequest({
  memberUserId,
  name,
  requestedAt,
  phone,
}: {
  memberUserId: string;
  name: string;
  /** When the request was made: the answer is refused if they asked again. */
  requestedAt: string;
  phone?: boolean;
}) {
  const [accepting, runAccept] = useRowAction();
  const [declining, runDecline] = useRowAction();
  const busy = accepting || declining;
  return (
    <span className="flex shrink-0 items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        className={QUIET}
        disabled={busy}
        aria-label={`Decline ${name}`}
        onClick={() =>
          runDecline(
            () =>
              answerLiftRequestAction({
                memberUserId,
                accept: false,
                requestedAt,
              }),
            "Request declined",
          )
        }
      >
        {declining ? <Spinner size="sm" label="Declining…" /> : null}
        Decline
      </Button>
      <Button
        size="sm"
        className={phone ? "h-10 w-24" : ROW_ACTION}
        disabled={busy}
        aria-label={`Accept ${name}`}
        onClick={() =>
          runAccept(
            () =>
              answerLiftRequestAction({
                memberUserId,
                accept: true,
                requestedAt,
              }),
            `${name} is in the car`,
          )
        }
      >
        {accepting ? <Spinner size="sm" label="Accepting…" /> : null}
        Accept
      </Button>
    </span>
  );
}

/** Take a rider out of a car: its driver, or a Transport editor. */
export function TakeOutButton({
  driverUserId,
  memberUserId,
  name,
  short,
  className,
}: {
  driverUserId: string;
  memberUserId: string;
  name: string;
  /** "Take out" on a phone, where the row is narrow. */
  short?: boolean;
  className?: string;
}) {
  const [pending, run] = useRowAction();
  return (
    <Button
      size="sm"
      variant="outline"
      className={cn(short ? "h-10 w-28" : "h-8 w-40", className)}
      disabled={pending}
      onClick={() =>
        run(
          () => removeRiderAction({ driverUserId, memberUserId }),
          `${name} is out of the car`,
        )
      }
    >
      {pending ? <Spinner size="sm" label="Taking out…" /> : null}
      {short ? "Take out" : "Take out of car"}
      <span className="sr-only"> ({name})</span>
    </Button>
  );
}

/** How many seats a car offers: a read value with a Change seats dialog. */
export function ChangeSeatsButton({
  driverUserId,
  seatsOffered,
  riders,
  className,
}: {
  driverUserId: string;
  seatsOffered: number | null;
  riders: number;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
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
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn(QUIET, "text-primary hover:text-primary", className)}
        onClick={() => {
          setValue(seatsOffered === null ? "" : String(seatsOffered));
          setError(null);
          setOpen(true);
        }}
      >
        Change seats
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Change seats</DialogTitle>
              <DialogDescription>
                How many people can ride with you, not counting you.
                {riders > 0
                  ? ` ${riders} ${riders === 1 ? "rides" : "ride"} with you now.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <Field
              label="Seats you offer"
              htmlFor={id}
              error={error ?? undefined}
            >
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
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner size="sm" label="Saving…" /> : null}
                Save seats
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * A driver writes to the people in their car. The form sends a title and a
 * message only; the server finds the car and its riders itself.
 */
export function CarMessageButton({
  riders,
  className,
}: {
  riders: string[];
  className?: string;
}) {
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
        size="sm"
        className={cn("h-8", className)}
        disabled={riders.length === 0}
        title={riders.length === 0 ? "Nobody rides with you yet" : undefined}
        onClick={() => setOpen(true)}
      >
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
                Goes to {listWords(riders)}, in their inbox and as a push. There
                is no signal at the burn, so send it before you leave.
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
              <TextareaWithCount
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

// --- Trailers ------------------------------------------------------------------

export interface EditableTrailer {
  id: string;
  name: string;
  notes: string | null;
  version: number;
  towedByUserId: string | null;
}

export function TrailerDialog({
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
              A trailer the camp has this year. Choose the car that tows it on
              the list.
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
            label="What it carries (optional)"
            htmlFor="trailer-notes"
            error={errors.notes}
            help="Or where to collect it."
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

export function AddTrailerButton({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("h-8", className)}
        onClick={() => setOpen(true)}
      >
        Add trailer
      </Button>
      <TrailerDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
