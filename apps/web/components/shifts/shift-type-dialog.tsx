"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import {
  SHIFT_MAX_PLACES,
  SHIFT_NAME_MAX,
  SHIFT_NOTE_MAX,
  SaveShiftTypeInput,
  type Team,
} from "@camp404/types";
import { dutyCardAlsoOn } from "@camp404/core";
import { saveShiftTypeAction } from "@/app/(console)/shifts/actions";
import {
  FillDaysButton,
  RemoveShiftButton,
} from "@/components/shifts/shift-controls";
import { clockFromMinutes, minutesFromClock } from "@/lib/shifts-copy";

// Adding or changing one shift type (#248): its team, name, hours, how many
// people it takes and a note. A new shift gets a slot on every Burn day. A
// problem with what was typed shows beside it; a refusal or a lost race shows
// in the dialog. Only teams the viewer may set up are offered; the server
// checks again. A shift may run past midnight (a night watch).
//
// The duty card (#250, the owner's Option A, 2026-10-02): a pick from the
// Survival Guide's duty cards, the shift's own team's first, then the other
// teams', then None. A card may serve several shifts, so each says which
// other shifts it is already on. A new shift left unpicked takes the card
// last year's shift of the same name had (the server's rule).

/** A duty card the picker offers. */
export interface DutyCardOption {
  id: string;
  title: string;
  team: string | null;
}

/** "none" picks no card; undefined leaves it to the server (see above). */
const NO_CARD = "none";

export interface EditableShiftType {
  id: string;
  team: Team;
  name: string;
  startMinute: number;
  durationMinutes: number;
  places: number;
  note: string | null;
  dutyCardId: string | null;
  version: number;
}

type Errors = Partial<
  Record<"team" | "name" | "start" | "end" | "places" | "note", string>
>;

export function ShiftTypeDialog({
  type,
  teams,
  triggerClassName,
  missingDays = 0,
  hasPeople = false,
  dutyCards = [],
  shiftTypes = [],
}: {
  /** The shift to change; absent to add one. */
  type?: EditableShiftType;
  /** The teams the viewer may set up shifts for. */
  teams: { key: Team; label: string }[];
  /** Sizes the trigger to the table's button slot. */
  triggerClassName?: string;
  /** Burn days the shift has no slot for yet: offered in the dialog. */
  missingDays?: number;
  /** Someone is on one of its days: it cannot be removed. */
  hasPeople?: boolean;
  /** The Survival Guide's duty cards, for the picker. */
  dutyCards?: DutyCardOption[];
  /** The year's shifts, to say which other shifts a card is on. */
  shiftTypes?: { id: string; name: string; dutyCardId: string | null }[];
}) {
  const router = useRouter();
  const initial = {
    team: type?.team ?? (teams.length === 1 ? teams[0]!.key : ""),
    name: type?.name ?? "",
    start: type ? clockFromMinutes(type.startMinute) : "",
    end: type
      ? clockFromMinutes((type.startMinute + type.durationMinutes) % 1440)
      : "",
    places: type ? String(type.places) : "",
    note: type?.note ?? "",
    // A card that is off the guide now is left as it is (undefined).
    card:
      type === undefined
        ? undefined
        : type.dutyCardId === null
          ? NO_CARD
          : dutyCards.some((c) => c.id === type.dutyCardId)
            ? type.dutyCardId
            : undefined,
  } as {
    team: string;
    name: string;
    start: string;
    end: string;
    places: string;
    note: string;
    card: string | undefined;
  };
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Errors>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const title = type ? `Change ${type.name}` : "Add a shift";
  const id = (field: string) => `shift-${type?.id ?? "new"}-${field}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const startMinute = minutesFromClock(form.start);
    const endMinute = minutesFromClock(form.end);
    const next: Errors = {};
    if (!form.team) next.team = "Pick the team whose shift it is.";
    if (startMinute === null) next.start = "Pick a start time.";
    if (endMinute === null) next.end = "Pick an end time.";
    // An end at or before the start runs past midnight.
    const duration =
      startMinute !== null && endMinute !== null
        ? (endMinute - startMinute + 1440) % 1440 || 1440
        : 0;
    const payload = {
      id: type?.id ?? null,
      team: form.team,
      name: form.name,
      startMinute: startMinute ?? -1,
      durationMinutes: duration,
      places: Number(form.places || "0"),
      note: form.note,
      ...(form.card === undefined
        ? {}
        : { dutyCardId: form.card === NO_CARD ? null : form.card }),
      expectedVersion: type?.version ?? 0,
    };
    const check = SaveShiftTypeInput.safeParse(payload);
    if (!check.success) {
      for (const issue of check.error.issues) {
        const field = String(issue.path[0]);
        const key = (
          field === "startMinute"
            ? "start"
            : field === "durationMinutes"
              ? "end"
              : field
        ) as keyof Errors;
        next[key] ??= issue.message;
      }
    }
    if (Object.keys(next).length > 0 || !check.success) {
      setErrors(next);
      return;
    }
    setErrors({});
    start(async () => {
      const result = await saveShiftTypeAction(check.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const added = result.data.daysAdded;
      toast.success(
        added > 0
          ? `${check.data.name} saved, on ${added} ${added === 1 ? "day" : "days"}.`
          : `${check.data.name} saved.`,
      );
      setOpen(false);
      if (!type) setForm(initial);
      router.refresh();
    });
  }

  return (
    <>
      {type ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={triggerClassName}
          aria-label={`Change ${type.name}`}
          onClick={() => setOpen(true)}
        >
          Change
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          className={triggerClassName}
          onClick={() => setOpen(true)}
        >
          Add a shift
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          if (!next) {
            setForm(initial);
            setErrors({});
            setError(null);
          }
          setOpen(next);
        }}
      >
        <DialogContent>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                One kind of shift, every day of the Burn. For a shift with
                roles, add one per role, like &ldquo;Brunch: head chef&rdquo;
                and &ldquo;Brunch: cooks&rdquo;.
              </DialogDescription>
            </DialogHeader>
            <Field label="Team" htmlFor={id("team")} error={errors.team}>
              <Select
                value={form.team}
                onValueChange={(v) => setForm((f) => ({ ...f, team: v }))}
              >
                <SelectTrigger
                  id={id("team")}
                  aria-invalid={errors.team ? true : undefined}
                >
                  <SelectValue placeholder="Pick a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Name" htmlFor={id("name")} error={errors.name}>
              <Input
                id={id("name")}
                value={form.name}
                maxLength={SHIFT_NAME_MAX}
                placeholder="Morning clean"
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                aria-invalid={errors.name ? true : undefined}
              />
            </Field>
            <div className="grid gap-4 page-sm:grid-cols-3">
              <Field label="Starts" htmlFor={id("start")} error={errors.start}>
                <Input
                  id={id("start")}
                  type="time"
                  step={900}
                  value={form.start}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, start: e.target.value }))
                  }
                  aria-invalid={errors.start ? true : undefined}
                />
              </Field>
              <Field
                label="Ends"
                htmlFor={id("end")}
                error={errors.end}
                help={
                  // Said only when it is true: an end at or before the start
                  // is the next morning.
                  (() => {
                    const from = minutesFromClock(form.start);
                    const to = minutesFromClock(form.end);
                    return from !== null && to !== null && to <= from
                      ? "Ends the next day: it runs past midnight."
                      : undefined;
                  })()
                }
              >
                <Input
                  id={id("end")}
                  type="time"
                  step={900}
                  value={form.end}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, end: e.target.value }))
                  }
                  aria-invalid={errors.end ? true : undefined}
                />
              </Field>
              <Field
                label="People"
                htmlFor={id("places")}
                error={errors.places}
              >
                <Input
                  id={id("places")}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={SHIFT_MAX_PLACES}
                  value={form.places}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, places: e.target.value }))
                  }
                  aria-invalid={errors.places ? true : undefined}
                />
              </Field>
            </div>
            <DutyCardPicker
              id={id("card")}
              value={form.card}
              onChange={(card) => setForm((f) => ({ ...f, card }))}
              cards={dutyCards}
              team={form.team}
              teamLabel={teams.find((t) => t.key === form.team)?.label}
              typeId={type?.id ?? null}
              shiftTypes={shiftTypes}
              offGuide={type?.dutyCardId != null && form.card === undefined}
              isNew={!type}
            />
            <Field
              label="What to do (optional)"
              htmlFor={id("note")}
              error={errors.note}
              help="Printed on the roster."
            >
              <Textarea
                id={id("note")}
                rows={2}
                value={form.note}
                maxLength={SHIFT_NOTE_MAX}
                onChange={(e) =>
                  setForm((f) => ({ ...f, note: e.target.value }))
                }
                aria-invalid={errors.note ? true : undefined}
              />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {type && missingDays > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <span className="text-sm text-muted-foreground">
                  {missingDays === 1
                    ? "1 Burn day has"
                    : `${missingDays} Burn days have`}{" "}
                  no slot for this shift yet.
                </span>
                <FillDaysButton
                  typeId={type.id}
                  missing={missingDays}
                  name={type.name}
                />
              </div>
            )}
            <DialogFooter className="gap-2 page-sm:justify-between">
              {type ? (
                hasPeople ? (
                  <span className="text-xs text-muted-foreground">
                    People are on it, so it can&apos;t be removed.
                  </span>
                ) : (
                  <RemoveShiftButton
                    id={type.id}
                    version={type.version}
                    name={type.name}
                  />
                )
              ) : (
                <span />
              )}
              <Button type="submit" disabled={pending}>
                {pending && <Spinner size="sm" label="Saving…" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The duty card pick: this team's cards, the other teams', then None. */
function DutyCardPicker({
  id,
  value,
  onChange,
  cards,
  team,
  teamLabel,
  typeId,
  shiftTypes,
  offGuide,
  isNew,
}: {
  id: string;
  value: string | undefined;
  onChange: (card: string) => void;
  cards: DutyCardOption[];
  team: string;
  teamLabel: string | undefined;
  typeId: string | null;
  shiftTypes: { id: string; name: string; dutyCardId: string | null }[];
  offGuide: boolean;
  isNew: boolean;
}) {
  const own = team ? cards.filter((c) => c.team === team) : [];
  const others = cards.filter((c) => !own.includes(c));
  const picked = cards.find((c) => c.id === value);
  const item = (c: DutyCardOption) => {
    const also = dutyCardAlsoOn(c.id, typeId, shiftTypes);
    return (
      <SelectItem key={c.id} value={c.id} className="py-2">
        <span className="flex flex-col">
          <span>{c.title}</span>
          {also.length > 0 && (
            <span className="text-xs opacity-70">
              also on {also.join(", ")}
            </span>
          )}
        </span>
      </SelectItem>
    );
  };
  return (
    <Field
      label="Duty card"
      htmlFor={id}
      help={
        offGuide
          ? "Its card is off the Survival Guide for now. Pick another, or leave it."
          : isNew && value === undefined
            ? "Left unpicked, it takes the card last year's shift of the same name had."
            : cards.length === 0
              ? "No duty cards in the Survival Guide yet."
              : "Opens from the shift's row, in the Survival Guide."
      }
    >
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="None">
            {value === NO_CARD ? "None" : picked?.title}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {own.length > 0 && (
            <SelectGroup>
              <SelectLabel className="pl-8 font-pixel text-[10px] font-normal uppercase tracking-[0.15em] text-muted-foreground">
                {teamLabel ?? "This team"}
              </SelectLabel>
              {own.map(item)}
            </SelectGroup>
          )}
          {others.length > 0 && (
            <SelectGroup>
              <SelectLabel className="pl-8 font-pixel text-[10px] font-normal uppercase tracking-[0.15em] text-muted-foreground">
                {own.length > 0 ? "Other teams" : "Duty cards"}
              </SelectLabel>
              {others.map(item)}
            </SelectGroup>
          )}
          <SelectItem value={NO_CARD}>None</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}
