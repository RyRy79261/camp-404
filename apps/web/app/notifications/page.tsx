import { redirect } from "next/navigation";
import { Bell, ChevronLeft, Megaphone, MessageSquare } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { listInbox, markRead, type InboxItem } from "@/lib/notifications";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notifications — Camp 404" };

// The member-facing notification inbox behind the header bell. Lists every
// notification delivered to the signed-in member, newest first, flagging the
// ones that were still unread on arrival. Opening the inbox clears the unread
// badge (marks everything read) — acknowledgements are handled separately by
// the full-screen gate, so reading here never counts as acknowledging.

function presentationIcon(p: InboxItem["presentation"]) {
  if (p === "acknowledge") return <Megaphone className="h-4 w-4" aria-hidden />;
  if (p === "popup") return <MessageSquare className="h-4 w-4" aria-hidden />;
  return <Bell className="h-4 w-4" aria-hidden />;
}

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
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">
        <a href="/">
          <ChevronLeft className="h-4 w-4" /> Home
        </a>
      </Button>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything that&apos;s been sent your way.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notifications yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const isNew = item.readAt === null;
            return (
              <li
                key={item.id}
                className={
                  "rounded-lg border p-4 " +
                  (isNew
                    ? "border-[color:var(--color-primary)]/40 bg-accent/20"
                    : "")
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {presentationIcon(item.presentation)}
                    </span>
                    <h2 className="text-sm font-semibold leading-tight">
                      {item.title}
                    </h2>
                    {isNew && (
                      <span className="rounded-full bg-[color:var(--color-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-primary-foreground)]">
                        New
                      </span>
                    )}
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.body}
                </p>
                {item.senderName && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    From {item.senderName}
                    {item.acknowledgedAt
                      ? " · acknowledged"
                      : item.presentation === "acknowledge"
                        ? " · awaiting acknowledgement"
                        : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
