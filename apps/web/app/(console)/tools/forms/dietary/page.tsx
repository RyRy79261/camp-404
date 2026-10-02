import { MEDICAL_AUDIENCE_NOTE } from "@camp404/core";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { getMyDietary } from "@/lib/dietary";
import { requireMemberPage } from "@/lib/member-gate";
import { DietaryForm } from "./dietary-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dietary needs — Camp 404" };

// A member's own dietary needs (#245; the owner, 2026-10-02: "the dietary form
// becomes a pick-list per food: allergy / intolerance / anaphylaxis + diet
// choices; old free text stays readable"). Each food is a row with how it
// affects them; then their diet. What the old form said is shown on top, in
// their own words, to pick again: nothing guesses it into the list.
// SAFETY_VISIBLE: the member, captains and team leads (MEDICAL_AUDIENCE_NOTE).

export default async function DietaryPage() {
  const { campUser } = await requireMemberPage();
  const mine = await getMyDietary(campUser.id);
  return (
    <div className="flex min-w-0 flex-col">
      <PageHeading
        eyebrow="Tools / My forms"
        title="Dietary needs"
        description={`Pick each food you react to and how, and your diet. The kitchen checks the menu against them. ${MEDICAL_AUDIENCE_NOTE}`}
      />
      <DietaryForm mine={mine} />
    </div>
  );
}
