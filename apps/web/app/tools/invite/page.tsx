import { redirect } from "next/navigation";
import { listInviteCodes } from "@camp404/db/invite-codes";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { InviteForm } from "./invite-form";
import { InviteList } from "./invite-list";

export const dynamic = "force-dynamic";

export const metadata = { title: "Invite — Camp 404" };

export default async function InviteToolPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }

  // A captain sees every code, the root code included; a member sees theirs.
  const isCaptain = campUser.rank === "captain";
  const codes = await listInviteCodes(
    isCaptain ? {} : { createdByUserId: campUser.id },
  );

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <GhostBack href="/tools" className="-ml-2 self-start">
        Tools
      </GhostBack>
      <InviteForm isCaptain={isCaptain} />
      <InviteList
        isCaptain={isCaptain}
        now={new Date()}
        items={codes.map((c) => ({
          code: c.code,
          note: c.note,
          maxUses: c.maxUses,
          useCount: c.useCount,
          expiresAt: c.expiresAt,
          revokedAt: c.revokedAt,
          requiresApproval: c.requiresApproval,
          createdAt: c.createdAt,
          createdByName: c.createdByName,
          mine: c.createdByUserId === campUser.id,
        }))}
      />
    </main>
  );
}
