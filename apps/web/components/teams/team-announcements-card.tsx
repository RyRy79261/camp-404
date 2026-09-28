import { Megaphone } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import type { TeamAnnouncement } from "@/lib/team-programs";

// What a team has sent (owner's ruling 3, 2026-09-27): every member may read
// a team's announcements on its program, newest first. Who RECEIVES them does
// not change. The server hands this only what went out: no draft, nothing
// waiting for its time, and no pin, audience count or read receipt.

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});

export function TeamAnnouncementsCard({
  items,
  more,
}: {
  items: readonly TeamAnnouncement[];
  /** The team has sent more than the card lists. */
  more: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4 text-accent" aria-hidden />
          Announcements
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This team hasn&rsquo;t sent any announcements yet.
          </p>
        ) : (
          <ul
            aria-label="Team announcements"
            className="-my-3 divide-y divide-border"
          >
            {items.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-3">
                <span className="text-sm font-medium">{a.title}</span>
                <span className="text-xs text-muted-foreground">
                  {[WHEN.format(a.sentAt), a.senderName]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                  {a.body}
                </p>
              </li>
            ))}
          </ul>
        )}
        {more ? (
          <p className="mt-3 text-xs text-muted-foreground">
            The latest {items.length} are shown.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
