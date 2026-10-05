"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LOUNGE_POLICY_MAX } from "@camp404/types";
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
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import { saveMusicPolicyAction } from "@/app/(console)/lounge/actions";
import { MarkdownField } from "@/components/markdown/markdown-field";

// The Lounge's music note (#269), apart from the other Lounge controls
// (lounge-controls.tsx): it is the one control that writes in the WYSIWYG
// Markdown editor, and only captains and the Lounge's leads see it.

/**
 * The music note for DJs: write or change it, in the shared WYSIWYG Markdown
 * editor with its preview (owner, 2026-10-01: long text is never a raw
 * textarea). Stored as Markdown; a note written before as plain lines reads
 * the same, since the reader keeps line breaks.
 */
export function MusicNoteButton({
  policy,
  version,
}: {
  policy: string | null;
  version: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(policy ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const tooLong = text.length > LOUNGE_POLICY_MAX;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveMusicPolicyAction({
        musicPolicy: text,
        expectedVersion: version,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Music note saved");
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
          setText(policy ?? "");
          setError(null);
          setOpen(true);
        }}
      >
        {policy ? "Edit" : "Write it"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-window-tint
          className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle>Music in the lounge</DialogTitle>
            <DialogDescription>
              What DJs should play. Everyone reads it, and a DJ sees it when
              they offer a set.
            </DialogDescription>
          </DialogHeader>
          <Field
            label="Music note"
            error={error}
            help={
              <span className={cn(tooLong && "text-destructive")}>
                {text.length} of {LOUNGE_POLICY_MAX} characters.
              </span>
            }
          >
            <MarkdownField
              label="Music note"
              value={text}
              onChange={setText}
              disabled={pending}
              emptyPreview="No music note yet."
            />
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || tooLong}>
              {pending && <Spinner size="sm" label="Saving…" />}
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
