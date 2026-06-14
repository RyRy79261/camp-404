import { redirect } from "next/navigation";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getTeamsConfig } from "@/lib/camp-config";
import { TeamSettingsManager, type TeamRow } from "./team-settings-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp settings — Camp 404" };

// Captains' camp-settings surface (Phase 2 — team admin). Preview-but-locked
// (D3): non-captains see the chrome + a CaptainLock, and the config is withheld
// server-side — never fetched, never sent. Captains get the full team editor
// (relabel / reorder / archive). The editor needs the WHOLE list (incl.
// archived, so they can be restored), order-sorted — not the active-only
// projection the roster filter uses.

export default async function CampSettingsPage() {
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

  const teams: TeamRow[] = cleared
    ? [...(await getTeamsConfig()).teams].sort((a, b) => a.order - b.order)
    : [];

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <GhostBack href="/captains/tools" className="-ml-2 mb-4">
        Camp tools
      </GhostBack>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Camp settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your camp&apos;s teams — rename them, change their order, or
          archive ones you&apos;re not using. Archived teams stay on existing
          records but drop out of the roster&apos;s team filter.
        </p>
      </header>

      {cleared ? (
        <TeamSettingsManager teams={teams} />
      ) : (
        <CaptainLock message="Camp settings are captain-only. Your rank doesn't have clearance for this." />
      )}
    </main>
  );
}
