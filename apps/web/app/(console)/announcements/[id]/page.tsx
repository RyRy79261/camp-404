import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
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
// lands. The inbox shows a clipped preview; this page is the whole message,
// laid out like the AfrikaBurn bulletin page (a link back to the inbox, the
// kicker, the title, then the body).
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
    <article className="flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/notifications"
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to notifications
      </Link>

      <header className="flex flex-col gap-3">
        <p className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.25em] text-accent">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          Announcement
          {announcement.senderName ? ` · From ${announcement.senderName}` : ""}
        </p>
        <h1 className="text-3xl tracking-tight [overflow-wrap:anywhere]">
          {announcement.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <span>
            Published{" "}
            <time dateTime={announcement.publishedAt.toISOString()}>
              {dateFmt.format(announcement.publishedAt)}
            </time>
          </span>
          {announcement.acknowledgedAt && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-accent">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                You acknowledged this on{" "}
                {dateFmt.format(announcement.acknowledgedAt)}
              </span>
            </>
          )}
        </div>
      </header>

      <hr className="border-border" />

      <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground [overflow-wrap:anywhere]">
        {announcement.body}
      </p>
    </article>
  );
}
