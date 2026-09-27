"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  TEAM_DESCRIPTION_MAX,
  TEAM_LINK_LABEL_MAX,
  TEAM_LINK_URL_MAX,
  TEAM_LINKS_MAX,
  TeamProgramInput,
  type Team,
  type TeamLink,
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
import { Spinner } from "@camp404/ui/components/spinner";
import { TextareaWithCount } from "@camp404/ui/components/textarea-with-count";
import { toast } from "@camp404/ui/components/toast";
import { saveTeamProgramAction } from "@/app/(console)/teams/[key]/actions";

// The Edit control on a team program's About card (owner's ruling 4,
// 2026-09-27), for a captain or a lead of that team only: the page renders it
// for no one else, and the action refuses anyone else anyway. Laid out as the
// power screens' dialogs: a problem with what was typed shows beside its
// field, a refusal from the server at the foot of the dialog.

export interface TeamAboutEditorProps {
  team: Team;
  teamLabel: string;
  description: string;
  links: readonly TeamLink[];
  version: number;
}

/** A form error's key: "description", "links.0.url", or "form". */
function issueKey(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "form" : path.map(String).join(".");
}

export function TeamAboutEditor(props: TeamAboutEditorProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [description, setDescription] = React.useState(props.description);
  const [links, setLinks] = React.useState<TeamLink[]>(() =>
    props.links.map((l) => ({ ...l })),
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const idBase = React.useId();
  const id = (name: string) => `${idBase}-${name}`;

  function reset() {
    setDescription(props.description);
    setLinks(props.links.map((l) => ({ ...l })));
    setErrors({});
    setError(null);
  }

  function setLink(i: number, patch: Partial<TeamLink>) {
    setLinks((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      team: props.team,
      description,
      links,
      expectedVersion: props.version,
    };
    const check = TeamProgramInput.safeParse(payload);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        next[issueKey(issue.path)] ??= issue.message;
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
        aria-label={`Edit what ${props.teamLabel} does and its links`}
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
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>About {props.teamLabel}</DialogTitle>
              <DialogDescription>
                Every member reads this on the team&rsquo;s program. Captains
                and this team&rsquo;s leads can change it.
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
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={errors.description ? true : undefined}
              />
            </Field>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-medium">Links</legend>
              {links.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No links yet. Add the team&rsquo;s documents, sheets or
                  folders.
                </p>
              ) : null}
              {links.map((link, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-border bg-muted/20 p-3"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label={`Link ${i + 1} name`}
                      htmlFor={id(`label-${i}`)}
                      error={errors[`links.${i}.label`]}
                    >
                      <Input
                        id={id(`label-${i}`)}
                        value={link.label}
                        maxLength={TEAM_LINK_LABEL_MAX}
                        onChange={(e) => setLink(i, { label: e.target.value })}
                        aria-invalid={
                          errors[`links.${i}.label`] ? true : undefined
                        }
                      />
                    </Field>
                    <Field
                      label={`Link ${i + 1} address`}
                      htmlFor={id(`url-${i}`)}
                      error={errors[`links.${i}.url`]}
                    >
                      <Input
                        id={id(`url-${i}`)}
                        type="url"
                        inputMode="url"
                        placeholder="https://"
                        value={link.url}
                        maxLength={TEAM_LINK_URL_MAX}
                        onChange={(e) => setLink(i, { url: e.target.value })}
                        aria-invalid={
                          errors[`links.${i}.url`] ? true : undefined
                        }
                      />
                    </Field>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-6"
                    aria-label={`Remove link ${i + 1}`}
                    onClick={() =>
                      setLinks((all) => all.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
              {errors.links ? (
                <p className="text-xs text-destructive">{errors.links}</p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={links.length >= TEAM_LINKS_MAX}
                onClick={() =>
                  setLinks((all) => [...all, { label: "", url: "" }])
                }
              >
                <Plus aria-hidden />
                Add a link
              </Button>
            </fieldset>

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
