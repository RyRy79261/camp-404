import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { getCampManagementRoster } from "@camp404/db/roster";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { toRosterRow } from "@/lib/camp-roster";
import { CampManagementRoster } from "./camp-management-roster";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp management — Camp 404" };

// Captains' camp-management roster. Access is rank-gated at the data layer,
// not by redirect: non-captains can reach this page but see a locked, empty
// shell — the server never sends them roster data. Only `rank = 'captain'`
// loads the real rows.

export default async function CampManagementPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }

  // Preview-but-locked (D3) on the shared clearance comparator: the locked view
  // gets no data — clearance is enforced here, server-side.
  const { cleared } = requireClearance(
    deriveViewerRank(campUser.rank, false),
    "captain",
  );
  const rows = cleared
    ? (await getCampManagementRoster()).map(toRosterRow)
    : [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">
        <a href="/">
          <ChevronLeft className="h-4 w-4" /> Captains
        </a>
      </Button>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Camp management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has signed up, their rank and status, whether
          they&apos;ve completed their required questionnaires, registered as a
          driver, and whether they&apos;re in South Africa.
        </p>
      </header>

      <CampManagementRoster rows={rows} locked={!cleared} />
    </main>
  );
}
