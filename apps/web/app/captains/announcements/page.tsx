import { redirect } from "next/navigation";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { listAnnouncements } from "@/lib/notifications";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { AnnouncementsManager } from "./announcements-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Announcements — Camp 404" };

// Captains' announcements & notifications composer. Preview-but-locked (D3):
// non-captains see the chrome + a CaptainLock instead of a redirect. The
// composer is an interactive draft/publish surface, so the locked view renders
// neither it nor any announcement data — the server never even fetches them.

export default async function AnnouncementsPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }
  const { cleared } = requireClearance(
    deriveViewerRank(campUser.rank, false),
    "captain",
  );

  // Withhold the data server-side when locked — never fetch what we won't send.
  const announcements = cleared ? await listAnnouncements() : [];

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <GhostBack href="/captains/tools" className="-ml-2 mb-4">
        Camp tools
      </GhostBack>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">
          Announcements &amp; notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compose a message, save it as a draft, then publish it to the whole
          camp. Everyone but you receives it. A full-screen announcement takes
          over each member&apos;s screen until they acknowledge it.
        </p>
      </header>

      {cleared ? (
        <AnnouncementsManager
          announcements={announcements}
          currentUserId={campUser.id}
        />
      ) : (
        <CaptainLock />
      )}
    </main>
  );
}
