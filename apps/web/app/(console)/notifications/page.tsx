import { redirect } from "next/navigation";
import { BellOff, ClipboardList } from "lucide-react";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { listInbox, markRead } from "@/lib/notifications";
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
import { PromotionRequestCard } from "./promotion-request-card";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notifications — Camp 404" };

// The member-facing notification inbox behind the header bell, laid out like
// the AfrikaBurn console inbox: a page heading, then the day groups, each in
// its own card. Lists every notification delivered to the signed-in member,
// newest first, flagging the ones that were still unread on arrival. Opening
// the inbox clears the unread badge (marks everything read) — acknowledgements
// are handled separately by the full-screen gate, so reading here never counts
// as acknowledging.

export default async function NotificationsPage() {
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

  // Snapshot the first page (with pre-read state), then clear the badge for
  // exactly those rows — a delivery that arrives after the snapshot stays
  // unread, and so do older ones until they are scrolled into view.
  const { items, nextCursor } = await listInbox(campUser.id);
  try {
    await markRead(
      campUser.id,
      items.map((i) => i.id),
    );
  } catch (err) {
    // The list is still worth showing. The badge stays until the next visit.
    console.error("notifications markRead failed", err);
  }

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Your account / Notifications"
        title="Notifications"
        description="Announcements, captain requests and questionnaires sent your way — one inbox."
      />

      <div className="flex flex-col gap-6">
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
            <ul className="grid gap-3 md:grid-cols-2">
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
              icon={<BellOff aria-hidden />}
              title="No notifications yet."
              description="Announcements, captain requests and questionnaires land here as they are sent."
            />
          )
        ) : (
          <InboxFeed
            initialItems={items}
            initialCursor={nextCursor}
            now={new Date()}
          />
        )}
      </div>
    </div>
  );
}
