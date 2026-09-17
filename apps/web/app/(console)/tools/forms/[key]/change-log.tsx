import { History } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@camp404/ui/components/card";
import type { FormEdit } from "@/lib/forms";

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CAMP_TIME_ZONE,
});

// The running edit history beside a replayed form: a side card with one entry
// per save, each listing the fields that changed as a from → to diff.
// Server-renderable — the page passes the edits in.
export function ChangeLog({ edits }: { edits: FormEdit[] }) {
  return (
    <section aria-labelledby="change-log-heading" className="lg:self-start">
      <Card>
        <CardHeader>
          <h2
            id="change-log-heading"
            className="flex items-center gap-2 text-base font-semibold normal-case leading-none tracking-normal"
          >
            <History className="h-4 w-4 text-accent" aria-hidden />
            Change log
          </h2>
          <CardDescription>
            Every time you update this form we record what changed. We
            don&apos;t keep old versions — just this running history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {edits.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              No edits yet. Changes you make here will show up in this list.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-border">
              {edits.map((edit) => (
                <li
                  key={edit.id}
                  className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0"
                >
                  <p className="font-mono text-xs text-muted-foreground">
                    {dateFmt.format(new Date(edit.createdAt))}
                  </p>
                  {edit.changes.map((change) => (
                    <div key={change.fieldId} className="flex flex-col gap-1">
                      <p className="text-sm font-medium text-foreground">
                        {change.label}
                      </p>
                      {/* The arrow is hidden from screen readers, so the words
                          "changed from" and "to" carry the relation instead. */}
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                          <span className="sr-only">Changed from </span>
                          {change.from}
                        </span>
                        <span className="text-muted-foreground" aria-hidden>
                          →
                        </span>
                        <span className="font-medium text-foreground">
                          <span className="sr-only">to </span>
                          {change.to}
                        </span>
                      </div>
                    </div>
                  ))}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
