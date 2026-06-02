import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { listAnnouncements } from "@/lib/notifications";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { CaptainLock } from "@/components/captain-lock";
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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">
        <a href="/captains/tools">
          <ChevronLeft className="h-4 w-4" /> Camp tools
        </a>
      </Button>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">
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
