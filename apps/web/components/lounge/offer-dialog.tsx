"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Music } from "lucide-react";
import { durationText } from "@camp404/core";
import {
  EditLoungeOfferInput,
  LOUNGE_BANDS,
  LOUNGE_NEEDS,
  LOUNGE_OFFER_KINDS,
  LoungeOfferInput,
  type LoungeBand,
  type LoungeNeed,
  type LoungeOfferKind,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Checkbox } from "@camp404/ui/components/checkbox";
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
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { editOfferAction, offerAction } from "@/app/(console)/lounge/actions";
import {
  DURATION_CHOICES,
  KIND_LABELS,
  NEED_LABELS,
  bandLabel,
} from "@/lib/lounge-copy";
import { MarkdownBody } from "@/components/announcements/markdown-body";
import { NoteBox } from "./lounge-parts";

// Offer an activity or a DJ set for the lounge, or, given `editing`, change
// your own offer (#269). The fields follow LoungeOfferInput. A DJ set shows
// the team's music note above the form, so a DJ reads the camp's guidance
// before offering. A problem with what was typed shows beside the field (the
// same Zod input the action parses); a refusal from the server shows at the
// foot of the dialog.

/** An offer as the dialog edits it: the host's own row, no one else's. */
export interface EditableOffer {
  id: string;
  version: number;
  kind: LoungeOfferKind;
  title: string;
  description: string | null;
  durationMinutes: number;
  needs: LoungeNeed[];
  needsNote: string | null;
  preferredDays: number[];
  preferredBands: LoungeBand[];
  recurring: boolean;
  publicGuide: boolean;
}

export interface DayOption {
  day: number;
  short: string;
}

type Errors = Partial<Record<string, string>>;

function toggle<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...list, value] : list.filter((v) => v !== value);
}

function CheckRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      {label}
    </label>
  );
}

export function OfferDialog({
  open,
  onOpenChange,
  editing,
  askedNote = null,
  days,
  musicPolicy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EditableOffer;
  /**
   * What the Ministry asked to change (an offer sent back): pinned at the top
   * of the form, and the form sends it back.
   */
  askedNote?: string | null;
  days: readonly DayOption[];
  musicPolicy: string | null;
}) {
  const sendingBack = editing !== undefined && askedNote !== null;
  const router = useRouter();
  const uid = React.useId();
  const id = (name: string) => `${uid}-${name}`;
  const [kind, setKind] = React.useState<LoungeOfferKind>(
    editing?.kind ?? "activity",
  );
  const [title, setTitle] = React.useState(editing?.title ?? "");
  const [description, setDescription] = React.useState(
    editing?.description ?? "",
  );
  const [duration, setDuration] = React.useState(
    editing?.durationMinutes ?? 60,
  );
  const [needs, setNeeds] = React.useState<LoungeNeed[]>(editing?.needs ?? []);
  const [needsNote, setNeedsNote] = React.useState(editing?.needsNote ?? "");
  const [preferredDays, setPreferredDays] = React.useState<number[]>(
    editing?.preferredDays ?? [],
  );
  const [preferredBands, setPreferredBands] = React.useState<LoungeBand[]>(
    editing?.preferredBands ?? [],
  );
  const [recurring, setRecurring] = React.useState(editing?.recurring ?? false);
  const [publicGuide, setPublicGuide] = React.useState(
    editing?.publicGuide ?? false,
  );
  const [errors, setErrors] = React.useState<Errors>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const durations = DURATION_CHOICES.includes(
    duration as (typeof DURATION_CHOICES)[number],
  )
    ? DURATION_CHOICES
    : [...DURATION_CHOICES, duration].sort((a, b) => a - b);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const fields = {
      kind,
      title,
      description,
      durationMinutes: duration,
      needs,
      needsNote,
      preferredDays,
      preferredBands,
      recurring,
      publicGuide,
    };
    const parsed = editing
      ? EditLoungeOfferInput.safeParse({
          ...fields,
          offerId: editing.id,
          expectedVersion: editing.version,
        })
      : LoungeOfferInput.safeParse(fields);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setServerError(null);
    startTransition(async () => {
      const result = editing
        ? await editOfferAction(parsed.data)
        : await offerAction(parsed.data);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      toast.success(
        sendingBack
          ? "Sent back to the Ministry of Vibes"
          : editing
            ? "Offer changed"
            : "Offer sent to the Ministry of Vibes",
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-window-tint
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>
            {editing ? "Change your offer" : "Offer something"}
          </DialogTitle>
          <DialogDescription>
            {sendingBack
              ? "Change what they asked for and send it back."
              : "An activity, a workshop or a DJ set for the lounge. The Ministry of Vibes answers here, and you can change it until they do."}
          </DialogDescription>
        </DialogHeader>

        {sendingBack && (
          <NoteBox title="The Ministry asked" testId="asked-note">
            {askedNote}
          </NoteBox>
        )}

        <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
          <Field label="What is it?" htmlFor={id("kind")}>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as LoungeOfferKind)}
            >
              <SelectTrigger id={id("kind")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOUNGE_OFFER_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {kind === "dj_set" && (
            <div
              data-testid="music-policy"
              className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm"
            >
              <Music
                className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                aria-hidden
              />
              <div className="flex flex-col gap-1">
                <p className="font-medium">Music in the lounge</p>
                {musicPolicy ? (
                  <MarkdownBody className="text-sm text-muted-foreground">
                    {musicPolicy}
                  </MarkdownBody>
                ) : (
                  <p className="text-muted-foreground">
                    The Ministry of Vibes hasn&apos;t written its music note
                    yet. Say what you play in the description.
                  </p>
                )}
              </div>
            </div>
          )}

          <Field
            label="Name"
            htmlFor={id("title")}
            required
            error={errors.title}
          >
            <Input
              id={id("title")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === "dj_set" ? "e.g. Sunset set" : "e.g. Sunrise yoga"
              }
              aria-invalid={errors.title ? true : undefined}
            />
          </Field>

          <Field
            label="Description"
            htmlFor={id("description")}
            help="What people will do or hear, and anything they should bring."
            error={errors.description}
          >
            <Textarea
              id={id("description")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>

          <Field
            label="How long"
            htmlFor={id("duration")}
            error={errors.durationMinutes}
          >
            <Select
              value={String(duration)}
              onValueChange={(v) => setDuration(Number(v))}
            >
              <SelectTrigger id={id("duration")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {durations.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {durationText(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">What it needs</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {LOUNGE_NEEDS.map((n) => (
                <CheckRow
                  key={n}
                  id={id(`need-${n}`)}
                  label={NEED_LABELS[n]}
                  checked={needs.includes(n)}
                  onChange={(on) => setNeeds((list) => toggle(list, n, on))}
                />
              ))}
            </div>
          </fieldset>

          <Field
            label="Anything else it needs"
            htmlFor={id("needs-note")}
            help="Such as two decks, a projector or ten mats."
            error={errors.needsNote}
          >
            <Input
              id={id("needs-note")}
              value={needsNote}
              onChange={(e) => setNeedsNote(e.target.value)}
            />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              Days that suit you
            </legend>
            <p className="text-xs text-muted-foreground">
              Tick none for any day.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {days.map((d) => (
                <CheckRow
                  key={d.day}
                  id={id(`day-${d.day}`)}
                  label={d.short}
                  checked={preferredDays.includes(d.day)}
                  onChange={(on) =>
                    setPreferredDays((list) => toggle(list, d.day, on))
                  }
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              Times that suit you
            </legend>
            <p className="text-xs text-muted-foreground">
              Tick none for any time.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {LOUNGE_BANDS.map((b) => (
                <CheckRow
                  key={b}
                  id={id(`band-${b}`)}
                  label={bandLabel(b)}
                  checked={preferredBands.includes(b)}
                  onChange={(on) =>
                    setPreferredBands((list) => toggle(list, b, on))
                  }
                />
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <CheckRow
              id={id("recurring")}
              label="I can do this more than once (on different days)"
              checked={recurring}
              onChange={setRecurring}
            />
            <CheckRow
              id={id("guide")}
              label="Put it in the AfrikaBurn event guide"
              checked={publicGuide}
              onChange={setPublicGuide}
            />
          </div>

          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Sending…"
                : sendingBack
                  ? "Send it back"
                  : editing
                    ? "Save changes"
                    : "Send offer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
