"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  EditPetHintInput,
  EditPetThingInput,
  MarkPetInInput,
  PET_HINT_MAX,
  PET_THING_MAX,
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
import {
  editPetHintAction,
  editPetThingAction,
  markPetInAction,
  setPetOwnerAction,
} from "@/app/(console)/pets/actions";

// The small client islands on a pet's card (Camp pets, option A): a founder's
// Mark as in, Edit hint and Set owner, and the pencil beside the stupid thing
// for the pet's own member (or a founder). Each opens a small dialog; a
// problem with what was typed shows beside the field, a refusal from the
// server at the dialog's foot. Never say what "in" means.

export interface OwnerChoice {
  id: string;
  name: string;
}

/**
 * A picture a founder may give a pet: its key, its name and its drawing,
 * drawn on the server (the pictures never ship to the browser as code).
 */
export interface PictureChoice {
  key: string;
  label: string;
  preview: React.ReactNode;
}

const NOBODY = "__nobody__";

/** One small dialog with one form: the shared frame of every control here. */
function SmallDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pending,
  serverError,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  submitLabel: string;
  pending: boolean;
  serverError: string | null;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-window-tint className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
          {serverError && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useDialogForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const openChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setError(null);
      setServerError(null);
    }
  };
  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done: string,
  ) {
    setServerError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      toast.success(done);
      openChange(false);
      router.refresh();
    });
  }
  return { open, openChange, error, setError, serverError, pending, run };
}

/** A founder marks a waiting pet in: its picture and the hint. */
export function MarkInButton({
  petId,
  petName,
  ownerName,
  pictures,
}: {
  petId: string;
  petName: string;
  ownerName: string | null;
  pictures: readonly PictureChoice[];
}) {
  const f = useDialogForm();
  const uid = React.useId();
  const [key, setKey] = React.useState(pictures[0]?.key ?? "");
  const preview = pictures.find((p) => p.key === key)?.preview;
  const [hint, setHint] = React.useState("");
  const [keyError, setKeyError] = React.useState<string | null>(null);

  function submit() {
    const parsed = MarkPetInInput.safeParse({ petId, moduleKey: key, hint });
    if (!parsed.success) {
      const byField = Object.fromEntries(
        parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
      );
      setKeyError(byField.moduleKey ?? null);
      f.setError(byField.hint ?? null);
      return;
    }
    setKeyError(null);
    f.setError(null);
    f.run(
      () => markPetInAction(parsed.data),
      `${petName} is in. ${ownerName ?? "Its member"} has the hint.`,
    );
  }

  return (
    <>
      <Button
        type="button"
        className="w-full"
        onClick={() => f.openChange(true)}
      >
        Mark as in
      </Button>
      <SmallDialog
        open={f.open}
        onOpenChange={f.openChange}
        title={`Mark ${petName} as in`}
        description={
          ownerName
            ? `${ownerName} gets this hint in their inbox, and it shows on ${petName}'s card.`
            : `The hint shows on ${petName}'s card.`
        }
        submitLabel="Mark as in"
        pending={f.pending}
        serverError={f.serverError}
        onSubmit={submit}
      >
        <Field label="Picture" htmlFor={`${uid}-key`} error={keyError}>
          {pictures.length === 0 ? (
            <p id={`${uid}-key`} className="text-sm text-muted-foreground">
              No picture is free yet.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <Select value={key} onValueChange={setKey}>
                <SelectTrigger id={`${uid}-key`} className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pictures.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preview && (
                <span aria-hidden className="flex h-10 shrink-0 items-center">
                  {preview}
                </span>
              )}
            </div>
          )}
        </Field>
        <Field
          label="Hint"
          htmlFor={`${uid}-hint`}
          help="One line. Don't give it away."
          error={f.error}
        >
          <Input
            id={`${uid}-hint`}
            value={hint}
            maxLength={PET_HINT_MAX}
            autoComplete="off"
            placeholder="Look near the clock after lunch"
            onChange={(e) => setHint(e.target.value)}
            aria-invalid={f.error ? true : undefined}
          />
        </Field>
      </SmallDialog>
    </>
  );
}

/** A founder changes the hint on a pet that is in. */
export function EditHintButton({
  petId,
  petName,
  current,
}: {
  petId: string;
  petName: string;
  current: string | null;
}) {
  const f = useDialogForm();
  const uid = React.useId();
  const [hint, setHint] = React.useState(current ?? "");

  function submit() {
    const parsed = EditPetHintInput.safeParse({ petId, hint });
    if (!parsed.success) {
      f.setError(parsed.error.issues[0]?.message ?? "Check the hint.");
      return;
    }
    f.setError(null);
    f.run(() => editPetHintAction(parsed.data), "Hint saved");
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setHint(current ?? "");
          f.openChange(true);
        }}
      >
        {current ? "Edit hint" : "Add a hint"}
      </Button>
      <SmallDialog
        open={f.open}
        onOpenChange={f.openChange}
        title={`${petName}'s hint`}
        description="Every member reads it on the card."
        submitLabel="Save hint"
        pending={f.pending}
        serverError={f.serverError}
        onSubmit={submit}
      >
        <Field
          label="Hint"
          htmlFor={`${uid}-hint`}
          help="One line. Don't give it away."
          error={f.error}
        >
          <Input
            id={`${uid}-hint`}
            value={hint}
            maxLength={PET_HINT_MAX}
            autoComplete="off"
            onChange={(e) => setHint(e.target.value)}
            aria-invalid={f.error ? true : undefined}
          />
        </Field>
      </SmallDialog>
    </>
  );
}

/** A founder says whose pet it is. */
export function SetOwnerButton({
  petId,
  petName,
  ownerId,
  owners,
}: {
  petId: string;
  petName: string;
  ownerId: string | null;
  owners: readonly OwnerChoice[];
}) {
  const f = useDialogForm();
  const uid = React.useId();
  const [owner, setOwner] = React.useState(ownerId ?? NOBODY);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOwner(ownerId ?? NOBODY);
          f.openChange(true);
        }}
      >
        Set owner
      </Button>
      <SmallDialog
        open={f.open}
        onOpenChange={f.openChange}
        title={`Whose is ${petName}?`}
        description="Their name shows on the card."
        submitLabel="Save"
        pending={f.pending}
        serverError={f.serverError}
        onSubmit={() =>
          f.run(
            () =>
              setPetOwnerAction({
                petId,
                ownerId: owner === NOBODY ? null : owner,
              }),
            "Owner saved",
          )
        }
      >
        <Field label="Member" htmlFor={`${uid}-owner`}>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger id={`${uid}-owner`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>Nobody yet</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </SmallDialog>
    </>
  );
}

/** The pet's member (or a founder) changes the one stupid thing. */
export function EditThingButton({
  petId,
  petName,
  current,
}: {
  petId: string;
  petName: string;
  current: string;
}) {
  const f = useDialogForm();
  const uid = React.useId();
  const [thing, setThing] = React.useState(current);

  function submit() {
    const parsed = EditPetThingInput.safeParse({ petId, stupidThing: thing });
    if (!parsed.success) {
      f.setError(parsed.error.issues[0]?.message ?? "Check it.");
      return;
    }
    f.setError(null);
    f.run(() => editPetThingAction(parsed.data), "Saved");
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground"
        aria-label={`Change the stupid thing about ${petName}`}
        onClick={() => {
          setThing(current);
          f.openChange(true);
        }}
      >
        <Pencil aria-hidden className="size-3.5" />
      </Button>
      <SmallDialog
        open={f.open}
        onOpenChange={f.openChange}
        title={`One stupid thing about ${petName}`}
        description="It shows on the card, as a quote."
        submitLabel="Save"
        pending={f.pending}
        serverError={f.serverError}
        onSubmit={submit}
      >
        <Field
          label="One stupid thing about them"
          htmlFor={`${uid}-thing`}
          help={`${thing.length} / ${PET_THING_MAX}`}
          error={f.error}
        >
          <Input
            id={`${uid}-thing`}
            value={thing}
            maxLength={PET_THING_MAX}
            autoComplete="off"
            onChange={(e) => setThing(e.target.value)}
            aria-invalid={f.error ? true : undefined}
          />
        </Field>
      </SmallDialog>
    </>
  );
}
