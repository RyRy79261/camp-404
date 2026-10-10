import Link from "next/link";
import { ChevronRight, NotebookPen } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import type { MeetingNoteSummary } from "@/lib/meeting-notes";
import {
  meetingCounts,
  meetingHref,
  meetingWhen,
} from "@/lib/meeting-notes-view";

// One meeting note as a row, the way the team page draws an open task: an
// icon, the title with when it was and who came beneath, the first thing it
// decided as a hint of what is inside, the team's badge, and a chevron that
// says the row opens. On a phone the badge drops under the title, so a long
// team name never squeezes it.

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
      href={meetingHref(note)}
      className="group grid grid-cols-[1rem_minmax(0,1fr)_1rem] items-center gap-x-3 gap-y-1.5 py-3 transition-colors hover:text-accent page-sm:grid-cols-[1rem_minmax(0,1fr)_auto_1rem]"
    >
      <NotebookPen className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{note.title}</span>
        <span className="block text-xs text-muted-foreground">
          {[meetingWhen(note.heldAt), counts].filter(Boolean).join(" · ")}
        </span>
        {note.firstDecision ? (
          <span className="block truncate text-xs text-muted-foreground">
            Decided: {note.firstDecision}
          </span>
        ) : null}
      </span>
      {teamLabel ? (
        <span className="col-start-2 row-start-2 flex page-sm:col-start-3 page-sm:row-start-1 page-sm:justify-end">
          <Badge variant="outline">{teamLabel}</Badge>
        </span>
      ) : null}
      <ChevronRight
        className="col-start-3 row-start-1 h-4 w-4 text-muted-foreground transition-colors group-hover:text-accent page-sm:col-start-4"
        aria-hidden
      />
    </Link>
  );
}
