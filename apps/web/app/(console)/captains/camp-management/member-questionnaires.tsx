"use client";

import {
  CAMP_TIME_ZONE,
  type MemberQuestionnaire,
  type MemberQuestionnaireStatus,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";

// Where each of a member's questionnaires stands, a card in the captain's
// member profile (docs/questionnaire-builder.md §9 Phase E). A divided list of
// title, due or finish date and a status badge, like the AfrikaBurn console's
// member list.

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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Questionnaires</CardTitle>
      </CardHeader>
      <CardContent>
        {questionnaires.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing has been sent to them yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {questionnaires.map((q) => {
              const status = STATUS[q.status];
              const detail = detailFor(q);
              return (
                <li
                  key={q.key}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {q.title}
                    </span>
                    {detail && (
                      <span className="text-xs text-muted-foreground">
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
      </CardContent>
    </Card>
  );
}
