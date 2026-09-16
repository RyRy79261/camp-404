import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { CheckCircle2 } from "lucide-react";
import { BackButton } from "@camp404/ui/components/back-button";
import { DetailHeader } from "@camp404/ui/components/detail-header";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { getAnnouncementForMember, markRead } from "@/lib/notifications";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { presentationIcon } from "../../notifications/presentation-meta";

export const dynamic = "force-dynamic";

export const metadata = { title: "Announcement — Camp 404" };

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CAMP_TIME_ZONE,
});

// One announcement in full: where a tap on its inbox row or its push message
// lands. The inbox shows a clipped preview; this page is the whole message.
//
// Only a member it was delivered to can open it. Anyone else, and any id that
// is not a published announcement, gets the same 404, so the page does not
// say whether an announcement exists.
export default async function AnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }

  const announcement = await getAnnouncementForMember(campUser.id, id);
  if (!announcement) notFound();

  // Opening it reads it. Acknowledging stays with the full-screen gate.
  await markRead(campUser.id, [announcement.deliveryId]);

  const Icon = presentationIcon(announcement.presentation);

  return (
    <main className="mx-auto w-full max-w-lg">
      <DetailHeader
        as="p"
        title="Notifications"
        className="px-3 py-3.5"
        leading={
          <BackButton
            linkAs={Link}
            href="/notifications"
            label="Back to notifications"
          />
        }
      />

      <article className="flex flex-col gap-4 px-4 pb-8 pt-3">
        <header className="flex flex-col gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold leading-tight [overflow-wrap:anywhere]">
            {announcement.title}
          </h1>
          <p className="text-label text-muted-foreground">
            {announcement.senderName
              ? `From ${announcement.senderName} · `
              : ""}
            <time dateTime={announcement.publishedAt.toISOString()}>
              {dateFmt.format(announcement.publishedAt)}
            </time>
          </p>
        </header>

        <p className="whitespace-pre-wrap text-base text-foreground [overflow-wrap:anywhere]">
          {announcement.body}
        </p>

        {announcement.acknowledgedAt && (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            You acknowledged this on{" "}
            {dateFmt.format(announcement.acknowledgedAt)}
          </p>
        )}
      </article>
    </main>
  );
}
