"use client";

import { useState, useTransition } from "react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Label } from "@camp404/ui/components/label";
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { addMemberNoteAction, type MemberNotesResult } from "./actions";

// Captains' notes on a member, a card in the captain's member profile (owner's
// call, 2026-09-16: captains only, audited, never in the CSV). The member never
// sees them. Append-only: there is no edit or delete, so the list is its own
// history. Drawn like the AfrikaBurn console's org-internal notes: a timeline
// of bordered notes, then an add form.

type Note = Extract<MemberNotesResult, { ok: true }>["notes"][number];

const MAX_LENGTH = 2000;

const when = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CAMP_TIME_ZONE,
});

export function MemberNotes({
  userId,
  notes,
  onChange,
}: {
  userId: string;
  notes: Note[];
  /** Hand the refreshed list back to the panel. */
  onChange: (notes: Note[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fieldId = `member-note-${userId}`;

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await addMemberNoteAction(userId, draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft("");
      onChange(res.notes);
    });
  }

  // Blanked in the desktop's last-seen copy of the roster (data-os-private).
  return (
    <Card data-os-private="">
      <CardHeader>
        <CardTitle className="text-base">Captain notes</CardTitle>
        <CardDescription>
          Only captains see these. The member never does.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notes.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No notes yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border bg-muted/40 p-3">
                <p className="whitespace-pre-line text-sm text-foreground">
                  {note.body}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {note.authorName ?? "A former captain"} ·{" "}
                  {when.format(new Date(note.createdAt))}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 border-t pt-4">
          <Label htmlFor={fieldId}>Add a note</Label>
          <Textarea
            id={fieldId}
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            rows={3}
            maxLength={MAX_LENGTH}
            disabled={isPending}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={isPending || draft.trim().length === 0}
              onClick={add}
            >
              {isPending && <Spinner size="sm" />}
              Add note
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
