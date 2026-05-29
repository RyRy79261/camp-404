import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { getReferralRoster } from "@camp404/db/relations";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { FamilyTree } from "./family-tree";

export const dynamic = "force-dynamic";

export const metadata = { title: "Family tree — Camp 404" };

export default async function FamilyTreePage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }

  const roster = await getReferralRoster();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">
        <a href="/tools">
          <ChevronLeft className="h-4 w-4" /> Tools
        </a>
      </Button>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Family tree</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who brought who onto Camp 404. Roots are accounts that pre-date the
          invite system; every other branch is one invite-code redemption.
        </p>
      </header>

      <FamilyTree roster={roster} viewerUserId={campUser.id} />
    </main>
  );
}
