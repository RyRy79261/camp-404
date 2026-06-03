import { redirect } from "next/navigation";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getReferralRoster } from "@camp404/db/relations";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { FamilyTree } from "./family-tree";

export const dynamic = "force-dynamic";

export const metadata = { title: "Family tree — Camp 404" };

export default async function FamilyTreePage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }

  const roster = await getReferralRoster();

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-4">
      <GhostBack href="/tools" className="-ml-2">
        Tools
      </GhostBack>

      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold">Family tree</h1>
          <p className="text-sm text-muted-foreground">
            Who brought who onto Camp 404. Roots are accounts that pre-date the
            invite system; every other branch is one invite-code redemption.
          </p>
        </div>

        <FamilyTree roster={roster} viewerUserId={campUser.id} />
      </div>
    </main>
  );
}
