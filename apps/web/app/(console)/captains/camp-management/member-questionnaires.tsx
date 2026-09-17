"use client";

import {
  CAMP_TIME_ZONE,
  type MemberQuestionnaire,
  type MemberQuestionnaireStatus,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";

// Where each of a member's questionnaires stands, on the captain's member
// panel (docs/questionnaire-builder.md §9 Phase E). The board draws only the
// "Outstanding: N to complete" line; this list is built from the panel's own
// parts (the section heading the answers use, Badge) and sits right under it.

const STATUS: Record<
  MemberQuestionnaireStatus,
  {
    label: string;
    variant: "success" | "warning" | "outline" | "secondary";
  }
> = {
  complete: { label: "Done", variant: "success" },
  "next-up": { label: "Up next", variant: "warning" },
  locked: { label: "Queued", variant: "outline" },
  optional: { label: "Optional", variant: "secondary" },
  expired: { label: "Closed", variant: "outline" },
};

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});

function detailFor(q: MemberQuestionnaire): string | null {
  if (q.status === "complete" && q.completedAt) {
    return `Done ${day.format(q.completedAt)}`;
  }
  if (
    (q.status === "next-up" ||
      q.status === "locked" ||
      q.status === "optional") &&
    q.dueAt
  ) {
    return `Due ${day.format(q.dueAt)}`;
  }
  return null;
}

export function MemberQuestionnaires({
  questionnaires,
}: {
  questionnaires: MemberQuestionnaire[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-mono text-micro font-bold uppercase tracking-wide text-muted-foreground">
        Questionnaires
      </h3>
      {questionnaires.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing has been sent to them yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {questionnaires.map((q) => {
            const status = STATUS[q.status];
            const detail = detailFor(q);
            return (
              <li
                key={q.key}
                className="flex items-center justify-between gap-3 rounded-md border bg-muted px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-sm text-foreground">
                    {q.title}
                  </span>
                  {detail && (
                    <span className="font-mono text-caption text-muted-foreground">
                      {detail}
                    </span>
                  )}
                </div>
                <Badge variant={status.variant} className="shrink-0">
                  {status.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
