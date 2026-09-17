import { listInviteCodes } from "@camp404/db/invite-codes";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { requireMemberPage } from "@/lib/member-gate";
import { usesTestStore } from "@/lib/test-mode";
import { InviteForm } from "./invite-form";
import { InviteList } from "./invite-list";

export const dynamic = "force-dynamic";

export const metadata = { title: "Invite — Camp 404" };

// Making invite codes, laid out like the invite links on an AfrikaBurn camp
// page: the codes in the main column and the form to make one in a side panel
// that stays in view. The form comes first in reading order, so a phone shows
// it above the list.
export default async function InviteToolPage() {
  const { campUser } = await requireMemberPage();

  // A captain sees every code, the root code included; a member sees theirs.
  const isCaptain = campUser.rank === "captain";
  // The E2E test store keeps no invite-code table to list.
  const codes = usesTestStore()
    ? []
    : await listInviteCodes(isCaptain ? {} : { createdByUserId: campUser.id });

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Tools / Invite"
        title="Invite a member"
        description="Make an invite code for someone you want to bring onto Camp 404, and keep track of the codes you have made."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:sticky lg:top-32 lg:col-start-3 lg:row-start-1 lg:self-start">
          <InviteForm isCaptain={isCaptain} />
        </div>
        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-1">
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
        </div>
      </div>
    </div>
  );
}
