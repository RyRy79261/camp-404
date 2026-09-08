import { redirect } from "next/navigation";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { planRollover } from "@camp404/db/cycle-rollover";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { RolloverPanel, type RolloverPlanView } from "./rollover-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Start a new year — Camp 404" };

// The year rollover, beside the team editor (spec §8). Preview-but-locked (D3)
// like every other captain surface: non-captains see the chrome and a
// CaptainLock, and the plan is withheld server-side — never fetched, never sent.
//
// planRollover() is a pure read with zero writes, so calling it on every page
// load is safe by construction; that is what lets the confirm screen show the
// captain the real numbers before anything happens.

export default async function CycleRolloverPage() {
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

  // Typed to the island's structural view so the page conforms to the client
  // contract by assignment, rather than the island importing the DB package.
  const plan: RolloverPlanView | null = cleared ? await planRollover() : null;

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <GhostBack href="/captains/camp-settings" className="-ml-2 mb-4">
        Camp settings
      </GhostBack>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Start a new year</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          When the camp moves on to the next burn, this is where you say so.
          Some questionnaires go out again on a blank form; most stay exactly as
          they are. Nothing is ever deleted — every previous year&apos;s answers
          stay readable.
        </p>
      </header>

      {plan ? (
        <RolloverPanel plan={plan} />
      ) : (
        <CaptainLock message="Starting a new year is captain-only. Your rank doesn't have clearance for this." />
      )}
    </main>
  );
}
