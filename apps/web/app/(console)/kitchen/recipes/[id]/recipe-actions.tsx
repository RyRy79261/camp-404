"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, GitBranch, Loader2, Type } from "lucide-react";
import { RECIPE_LESSON_MAX, RECIPE_TEXT_MAX } from "@camp404/types";
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
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { recipePath } from "@/lib/recipe-copy";
import {
  acceptProofreadAction,
  addLessonAction,
  retypeRecipeTextAction,
  startVariationAction,
} from "../actions";

// The recipe page's smaller islands. Each posts through its action and the
// page re-renders from the server. A problem shows in the form or dialog it
// came from.

/** A Kitchen lead or a captain retypes or pastes in the working text. */
export function RetypeText({
  recipeId,
  text: initial,
}: {
  recipeId: string;
  text: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!text.trim()) {
      setError("Paste the recipe text.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await retypeRecipeTextAction({ recipeId, text });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Recipe text saved");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setText(initial ?? "");
          setError(null);
          setOpen(true);
        }}
      >
        <Type aria-hidden />
        {initial ? "Retype text" : "Paste the text"}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && !pending && setOpen(o)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Retype the recipe text</DialogTitle>
            <DialogDescription>
              The text a captain or a Kitchen lead may send to Claude. Typing it
              yourself makes it yours, so the member&apos;s choice about Claude
              no longer applies to it.
            </DialogDescription>
          </DialogHeader>
          <Field label="Recipe text" htmlFor="retype-text" error={error}>
            <Textarea
              id="retype-text"
              value={text}
              rows={12}
              maxLength={RECIPE_TEXT_MAX}
              disabled={pending}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
            />
          </Field>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={pending} onClick={save}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Save text
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A sibling recipe, such as a gluten-free one, linked to this one. */
export function StartVariation({
  recipeId,
  title: original,
}: {
  recipeId: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function start() {
    if (!title.trim()) {
      setError("Give the variation a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startVariationAction({ recipeId, title });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Variation started");
      setOpen(false);
      router.push(recipePath(result.data.id));
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setTitle(`${original} (gluten-free)`);
          setError(null);
          setOpen(true);
        }}
      >
        <GitBranch aria-hidden />
        Start a variation
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a variation</DialogTitle>
            <DialogDescription>
              A dish of its own that goes a different way, such as a gluten-free
              one. It starts approved, with its own versions, and changes
              nothing about {original}.
            </DialogDescription>
          </DialogHeader>
          <Field label="Variation name" htmlFor="variation-title" error={error}>
            <Input
              id="variation-title"
              value={title}
              maxLength={120}
              disabled={pending}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
            />
          </Field>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={pending} onClick={start}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Start variation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Why a recipe is accepted as Claude wrote it, recorded on the version. */
export const ACCEPTED_AS_WRITTEN = "Accepted as Claude wrote it";

/**
 * Accept the recipe an older run wrote, unchanged, as the next version; the
 * write reads it from the run, so nothing of the recipe is sent from here.
 */
export function AcceptProofread({
  recipeId,
  runId,
}: {
  recipeId: string;
  runId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptProofreadAction({
        recipeId,
        runId,
        reason: ACCEPTED_AS_WRITTEN,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Accepted as version ${result.data.version}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button disabled={pending} onClick={accept}>
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Check aria-hidden />
          )}
          Accept Claude&apos;s recipe
        </Button>
      </div>
    </div>
  );
}

/** What the cooks learned. Any approved member adds one. */
export function AddLesson({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) {
      setError("Write what the kitchen learned.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addLessonAction({ recipeId, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Lesson added");
      setBody("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={add} noValidate className="flex flex-col gap-2">
      <Field label="Add a lesson" htmlFor="lesson-body" error={error}>
        <Textarea
          id="lesson-body"
          value={body}
          rows={3}
          maxLength={RECIPE_LESSON_MAX}
          placeholder="e.g. Double the cumin at altitude; the 50 L pot burns on the big burner."
          disabled={pending}
          onChange={(e) => {
            setBody(e.target.value);
            setError(null);
          }}
        />
      </Field>
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Add lesson
        </Button>
      </div>
    </form>
  );
}
