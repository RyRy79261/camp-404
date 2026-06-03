import { redirect } from "next/navigation";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getCampManagementRoster } from "@/lib/roster";
import { toRosterRow } from "@/lib/camp-roster";
import { CampManagementRoster } from "./camp-management-roster";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp management — Camp 404" };

// Captains' camp-management roster. Access is rank-gated at the data layer, not
// by redirect: non-captains reach this page but the server withholds the rows
// (rows=[], locked) and the island shows a CaptainLock — preview-but-locked
// (D3). Only `rank = 'captain'` loads the real roster.

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
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <GhostBack href="/captains/tools" className="-ml-2 mb-3">
        Camp tools
      </GhostBack>

      <header className="mb-6 flex flex-col gap-3">
        {/* TermBar — terminal chrome, ≥ sm only. */}
        <div className="hidden items-center gap-2.5 self-start rounded-lg border bg-muted px-3.5 py-2 sm:inline-flex">
          <span className="font-mono text-caption font-medium text-muted-foreground">
            camp404 · roster
          </span>
          <span className="font-mono text-caption font-medium text-accent">
            {rows.length} {rows.length === 1 ? "record" : "records"}
          </span>
        </div>

        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground sm:font-mono">
          <span aria-hidden className="hidden text-accent sm:inline">
            {">"}
          </span>
          Camp management
          <span
            aria-hidden
            className="hidden h-6 w-3 animate-pulse bg-accent sm:inline-block"
          />
        </h1>

        <p className="hidden max-w-2xl text-sm text-muted-foreground sm:block">
          The full roster. Open a member to read their profile, approve or
          reject pending sign-ups, and — captain to captain — assign captain
          rank.
        </p>
      </header>

      <CampManagementRoster rows={rows} locked={!cleared} />
    </main>
  );
}
