import { redirect } from "next/navigation";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { InviteForm } from "./invite-form";

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

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <GhostBack href="/tools" className="-ml-2 self-start">
        Tools
      </GhostBack>
      <InviteForm isCaptain={campUser.rank === "captain"} />
    </main>
  );
}
