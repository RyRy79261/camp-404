import { redirect } from "next/navigation";
import { BellOff, ClipboardList, Megaphone } from "lucide-react";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { countUnread, listInbox, markRead } from "@/lib/notifications";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getPendingQuestionnaires,
  hasCampAccess,
  isApproved,
  syncOpenGates,
} from "@/lib/users";
import { getIncomingPromotionsForUser } from "@/lib/promotion";
import { QueueCard } from "@/components/questionnaire/queue-card";
import { InboxFeed } from "./inbox-feed";
import { NotificationFilterTabs } from "./filter-tabs";
import {
  feedIds,
  marksPageRead,
  parseInboxFilter,
  type InboxFilter,
} from "./filter";
import { PromotionRequestCard } from "./promotion-request-card";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notifications — Camp 404" };

// The member-facing notification inbox behind the header bell, laid out like
// the AfrikaBurn console inbox: a page heading, the All / Unread / Announcements
// tabs, then the day groups, each in its own card. Lists every notification
// delivered to the signed-in member, newest first, flagging the ones that were
// still unread on arrival. Opening the inbox clears the unread badge (marks
// everything read) — acknowledgements are handled separately by the full-screen
// gate, so reading here never counts as acknowledging.
//
// The tab lives in `?filter=` and is applied in SQL (never to a fetched page,
// which would break paging). The Unread tab is the one that does NOT mark its
// page read, so it cannot empty itself while the member reads it — see
// `marksPageRead` in ./filter.

/** The empty state each tab deserves: "nothing" and "nothing left" differ. */
const EMPTY: Record<
  InboxFilter,
  { icon: React.ReactNode; title: string; description: string }
> = {
  all: {
    icon: <BellOff aria-hidden />,
    title: "No notifications yet.",
    description:
      "Announcements, captain requests and questionnaires land here as they are sent.",
  },
  unread: {
    icon: <BellOff aria-hidden />,
    title: "You're all caught up.",
    description: "Everything in your inbox has been read.",
  },
  announcements: {
    icon: <Megaphone aria-hidden />,
    title: "No announcements yet.",
    description:
      "Messages a captain or a team lead sends the camp show up here.",
  },
};

/**
 * The inbox itself. Draws the first page on the server, clears the badge for
 * exactly the rows it drew (except on the Unread tab), and hands the rest of
 * the paging to `InboxFeed`.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }

  // The questionnaires still waiting on this member. Reading the inbox never
  // clears these: only finishing the form does (owner's call, 2026-09-16:
  // "a notification section that would shout until it's done"). Sync first, so
  // a member who joined after a send opened sees it here too.
  await syncOpenGates(campUser.id);
  const pending = await getPendingQuestionnaires(campUser.id);
  // A captain request waits here too. Only an approved member can accept one
  // (the action refuses anyone else), so nobody else is shown it.
  const promotions = isApproved(campUser, authUser.primaryEmail)
    ? await getIncomingPromotionsForUser(campUser.id)
    : [];

  // An unknown ?filter= opens the whole inbox rather than 404ing: a shared link
  // with a stale param should still show the member their notifications.
  const filter = parseInboxFilter((await searchParams)?.filter);

  // Snapshot the first page (with pre-read state), then clear the badge for
  // exactly those rows — a delivery that arrives after the snapshot stays
  // unread, and so do older ones until they are scrolled into view.
  const { items, nextCursor } = await listInbox(campUser.id, { filter });
  if (marksPageRead(filter)) {
    try {
      await markRead(campUser.id, feedIds(items));
    } catch (err) {
      // The list is still worth showing. The badge stays until the next visit.
      console.error("notifications markRead failed", err);
    }
  }
  // The number beside the Unread tab is read AFTER that clear, so it is what
  // the Unread tab would actually list. Reading it first would put "Unread · 5"
  // on a tab that this very render just emptied.
  const unreadCount = await countUnread(campUser.id);

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Your account / Notifications"
        title="Notifications"
        description="Announcements, captain requests and questionnaires sent your way — one inbox."
      />

      <div className="flex flex-col gap-6">
        <NotificationFilterTabs filter={filter} unreadCount={unreadCount} />

        {promotions.length > 0 && (
          <section aria-label="Captain request" className="flex flex-col gap-3">
            {promotions.map((p) => (
              <PromotionRequestCard
                key={p.id}
                requestId={p.id}
                requesterName={p.requestedByName}
              />
            ))}
          </section>
        )}

        {pending.length > 0 && (
          <section
            aria-labelledby="needs-your-answer"
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              <h2
                id="needs-your-answer"
                className="flex items-center gap-2 text-base font-semibold normal-case tracking-normal"
              >
                <ClipboardList className="h-4 w-4 text-accent" aria-hidden />
                Needs your answer
              </h2>
              <p className="text-sm text-muted-foreground">
                {pending.length === 1
                  ? "A captain is waiting on this questionnaire. It stays here until you finish it."
                  : `A captain is waiting on these ${pending.length} questionnaires. They stay here until you finish them.`}
              </p>
            </div>
            <ul className="grid gap-3 page-md:grid-cols-2">
              {pending.map((q) => (
                <li key={q.activationId}>
                  <QueueCard
                    title={q.title}
                    status="next-up"
                    blocking={q.blocking}
                    dueAt={q.dueAt}
                    href={`/questionnaires/${q.activationId}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {items.length === 0 ? (
          pending.length === 0 &&
          promotions.length === 0 && (
            <EmptyState
              icon={EMPTY[filter].icon}
              title={EMPTY[filter].title}
              description={EMPTY[filter].description}
            />
          )
        ) : (
          <InboxFeed
            // A tab switch is a same-route navigation, so React would keep the
            // feed's rows and cursor and only swap `filter` — Announcements
            // would open on the All tab's rows. The key starts it fresh.
            key={filter}
            initialItems={items}
            initialCursor={nextCursor}
            filter={filter}
            now={new Date()}
          />
        )}
      </div>
    </div>
  );
}
