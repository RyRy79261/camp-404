import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
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
    <main className="mx-auto max-w-xl px-6 py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">
        <a href="/tools">
          <ChevronLeft className="h-4 w-4" /> Tools
        </a>
      </Button>
      <InviteForm isCaptain={campUser.rank === "captain"} />
    </main>
  );
}
