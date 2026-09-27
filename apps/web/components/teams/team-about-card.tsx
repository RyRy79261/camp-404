import type { ReactNode } from "react";
import { ExternalLink, Info } from "lucide-react";
import { isWebAddress, type TeamLink } from "@camp404/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";

// What a team does and where its things live (owner's ruling 4, 2026-09-27):
// the team's own description and links, at the top of its program. Every
// member reads it; the team's leads and captains get the Edit control in the
// header (`editor`), which the page passes only to them. A link is drawn only
// when it is a web address, as the write already insists: a bad stored value
// never becomes an href.

export function TeamAboutCard({
  description,
  links,
  editor,
}: {
  description: string;
  links: readonly TeamLink[];
  /** The Edit control, for a captain or a lead of this team only. */
  editor?: ReactNode;
}) {
  const safe = links.filter((l) => isWebAddress(l.url));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4 text-accent" aria-hidden />
          About this team
        </CardTitle>
        {editor}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {description ? (
          <p
            data-testid="team-description"
            className="whitespace-pre-line text-sm"
          >
            {description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nobody has written what this team does yet.
          </p>
        )}
        {safe.length > 0 ? (
          <ul aria-label="Team links" className="flex flex-wrap gap-2">
            {safe.map((link, i) => (
              <li key={`${i}-${link.url}`}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{link.label}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
