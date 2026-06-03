import { redirect } from "next/navigation";
import { BellOff, ChevronLeft } from "lucide-react";
import { DetailHeader } from "@camp404/ui/components/detail-header";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { listInbox, markRead } from "@/lib/notifications";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { NotificationRow } from "./notification-row";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notifications — Camp 404" };

// The member-facing notification inbox behind the header bell. Lists every
// notification delivered to the signed-in member, newest first, flagging the
// ones that were still unread on arrival. Opening the inbox clears the unread
// badge (marks everything read) — acknowledgements are handled separately by
// the full-screen gate, so reading here never counts as acknowledging.
export default async function NotificationsPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }

  // Snapshot the inbox (with pre-read state), then clear the badge for exactly
  // those rows — a delivery that arrives after the snapshot stays unread.
  const items = await listInbox(campUser.id);
  await markRead(
    campUser.id,
    items.map((i) => i.id),
  );

  return (
    <main className="mx-auto w-full max-w-lg">
      <DetailHeader
        as="h2"
        title="Home"
        className="px-3 py-3.5"
        leading={
          <a
            href="/"
            aria-label="Back to home"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </a>
        }
      />

      <div className="flex flex-col gap-1.5 px-4 pb-2 pt-3">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-label text-muted-foreground">
          Everything that&apos;s been sent your way.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6">
          <EmptyState
            icon={<BellOff className="h-5 w-5" aria-hidden />}
            title="No notifications yet."
            description="Everything sent your way will appear here."
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-3 px-4 pb-5 pt-2">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              presentation={item.presentation}
              title={item.title}
              body={item.body}
              senderName={item.senderName}
              isNew={item.readAt === null}
              acknowledgedAt={item.acknowledgedAt}
              createdAt={item.createdAt}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
