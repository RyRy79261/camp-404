import Link from "next/link";
import { LogOut, Tent, UserRound } from "lucide-react";
import { deriveViewerRank } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { SignOutLink } from "@/components/auth/sign-out-link";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { rankLabel } from "@/lib/camp-roster";
import { consoleNavFor } from "@/lib/console-nav";
import { countUnread } from "@/lib/notifications";
import {
  getPendingQuestionnaires,
  isTeamLead,
  type CampUser,
} from "@/lib/users";
import { ConsoleNav } from "./console-nav";

/**
 * The console chrome every signed-in, cleared page sits under (taken from the
 * AfrikaBurn organiser console): the brand mark, who is signed in and at what
 * rank, the bell, Account and Sign out, and the nav bar below.
 *
 * The nav is filtered here, on the server, so the client never learns a
 * destination exists that the viewer's rank cannot open.
 *
 * The bell opens the notification panel rather than jumping to the inbox
 * (AfrikaBurn's console header). The counts are still read here, on the server,
 * so the badge is right before anyone touches it; the panel fetches its own
 * rows when it opens.
 */
export async function ConsoleHeader({
  campUser,
  email,
}: {
  campUser: CampUser;
  email: string | null;
}) {
  // The bell counts unread inbox items plus every questionnaire still waiting
  // on this member: reading the inbox clears the first, not the second.
  const [lead, unread, pending] = await Promise.all([
    isTeamLead(campUser.id),
    countUnread(campUser.id),
    getPendingQuestionnaires(campUser.id),
  ]);
  const count = unread + pending.length;
  const viewerRank = deriveViewerRank(campUser.rank, lead);
  const navItems = consoleNavFor(viewerRank);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Tent className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">
                Camp 404
              </span>
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-accent">
                Camp console
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-[16rem] truncate text-sm text-foreground">
                {campUser.displayName ?? email ?? "Signed in"}
              </p>
              <Badge
                variant={campUser.rank === "captain" ? "default" : "secondary"}
                className="mt-0.5"
              >
                {rankLabel(campUser.rank, lead)}
              </Badge>
            </div>
            <NotificationPanel count={count} unreadCount={unread} />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/profile" aria-label="Your account">
                <UserRound className="h-4 w-4" aria-hidden />
                <span className="sr-only sm:not-sr-only sm:ml-2">Account</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <SignOutLink>
                <LogOut aria-hidden />
                Sign out
              </SignOutLink>
            </Button>
          </div>
        </div>

        <ConsoleNav items={navItems} />
      </div>
    </header>
  );
}
