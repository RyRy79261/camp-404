import type { ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";

// What a team does (owner's ruling 4, 2026-09-27): the team's own
// description, at the top of its program. Every member reads it; the team's
// leads and captains get the Edit control in the header (`editor`), which the
// page passes only to them. No links (owner, 2026-09-27): everything a team
// needs happens inside the app.

export function TeamAboutCard({
  description,
  editor,
}: {
  description: string;
  /** The Edit control, for a captain or a lead of this team only. */
  editor?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4 text-accent" aria-hidden />
          About this team
        </CardTitle>
        {editor}
      </CardHeader>
      <CardContent>
        {description ? (
          <p
            data-testid="team-description"
            className="max-w-[65ch] whitespace-pre-line text-sm"
          >
            {description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nobody has written what this team does yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
