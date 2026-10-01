"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  TEAM_DESCRIPTION_MAX,
  TeamProgramInput,
  type Team,
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
import { Spinner } from "@camp404/ui/components/spinner";
import { TextareaWithCount } from "@camp404/ui/components/textarea-with-count";
import { toast } from "@camp404/ui/components/toast";
import { saveTeamProgramAction } from "@/app/(console)/teams/[key]/actions";

// The Edit control on a team program's About card (owner's ruling 4,
// 2026-09-27), for a captain or a lead of that team only: the page renders it
// for no one else, and the action refuses anyone else anyway. Laid out as the
// power screens' dialogs: a problem with what was typed shows beside its
// field, a refusal from the server at the foot of the dialog. It takes the
// description only: no links to outside tools (owner, 2026-09-27).

export interface TeamAboutEditorProps {
  team: Team;
  teamLabel: string;
  description: string;
  version: number;
}

export function TeamAboutEditor(props: TeamAboutEditorProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [description, setDescription] = React.useState(props.description);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();
  const id = (name: string) => `${idBase}-${name}`;

  function reset() {
    setDescription(props.description);
    setErrors({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      team: props.team,
      description,
      expectedVersion: props.version,
    };
    const check = TeamProgramInput.safeParse(payload);
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
      const result = await saveTeamProgramAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("About this team saved");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        aria-label={`Edit what ${props.teamLabel} does`}
      >
        <Pencil aria-hidden />
        Edit
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
          className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
        >
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>About {props.teamLabel}</DialogTitle>
              <DialogDescription>
                Every member reads this on the {props.teamLabel} page. Captains
                and {props.teamLabel} leads can change it.
              </DialogDescription>
            </DialogHeader>

            <Field
              label="What the team does"
              htmlFor={id("description")}
              error={errors.description}
            >
              <TextareaWithCount
                id={id("description")}
                value={description}
                maxLength={TEAM_DESCRIPTION_MAX}
                rows={4}
                // Grows with the text, so the whole of it shows when it opens.
                textareaClassName="field-sizing-content min-h-24"
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={errors.description ? true : undefined}
              />
            </Field>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner aria-hidden /> : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
