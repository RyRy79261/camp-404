import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import type { MeetingNoteSummary } from "@/lib/meeting-notes";
import { meetingCounts, meetingWhen } from "@/lib/meeting-notes-view";

// One meeting note as a row, the way the team page draws an open task: an
// icon, the title with when it was beneath, and the team's badge. On a phone
// the badge drops under the title, so a long team name never squeezes it.

export function MeetingRow({
  note,
  teamLabel,
}: {
  note: MeetingNoteSummary;
  /** The team's name, or "Whole camp"; omitted where the list is one team's. */
  teamLabel?: string;
}) {
  const counts = meetingCounts(note);
  return (
    <Link
      href={`/meetings/${note.id}`}
      className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 py-3 transition-colors hover:text-accent sm:grid-cols-[1rem_minmax(0,1fr)_auto]"
    >
      <NotebookPen className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{note.title}</span>
        <span className="block text-xs text-muted-foreground">
          {[meetingWhen(note.heldAt), counts].filter(Boolean).join(" · ")}
        </span>
      </span>
      {teamLabel ? (
        <span className="col-start-2 flex sm:col-start-3 sm:row-start-1 sm:justify-end">
          <Badge variant="outline">{teamLabel}</Badge>
        </span>
      ) : null}
    </Link>
  );
}
