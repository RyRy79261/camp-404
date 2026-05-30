import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { listAnnouncements } from "@/lib/notifications";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { AnnouncementsManager } from "./announcements-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Announcements — Camp 404" };

// Captains' announcements & notifications composer. Captain-clearance only:
// a non-captain is bounced home (there is no useful locked view here, unlike
// the camp-management roster). Captains compose a draft, then publish it to
// the whole camp as a notification — full-screen acknowledge, pop-up, or a
// quiet inbox entry.

export default async function AnnouncementsPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }
  if (campUser.rank !== "captain") {
    redirect("/");
  }

  const announcements = await listAnnouncements();

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

      <AnnouncementsManager
        announcements={announcements}
        currentUserId={campUser.id}
      />
    </main>
  );
}
