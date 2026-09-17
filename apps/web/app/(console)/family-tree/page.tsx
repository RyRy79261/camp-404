import { PageHeading } from "@camp404/ui/components/page-heading";
import { requireMemberPage } from "@/lib/member-gate";
import { getReferralRosterForViewer } from "@/lib/relations";
import { FamilyTree } from "./family-tree";

export const dynamic = "force-dynamic";

export const metadata = { title: "Family tree — Camp 404" };

export default async function FamilyTreePage() {
  const { campUser } = await requireMemberPage();

  // Projected for this viewer on the server: only a captain receives other
  // members' invite codes.
  const roster = await getReferralRosterForViewer(campUser);
  const showsInviteCodes = campUser.rank === "captain";

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Tools / Family tree"
        title="Family tree"
        description="Who brought who onto Camp 404. Roots are accounts that pre-date the invite system; every other branch is one invite-code redemption."
      />

      <FamilyTree
        roster={roster}
        viewerUserId={campUser.id}
        showsInviteCodes={showsInviteCodes}
      />
    </div>
  );
}
