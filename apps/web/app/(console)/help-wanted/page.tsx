import { PageHeading } from "@camp404/ui/components/page-heading";
import { HelpWantedBoard } from "@/components/help-wanted/help-wanted-board";
import { captainPageGate } from "@/lib/captain-gate";
import { getHelpWantedView } from "@/lib/help-wanted";
import { KEEPER_DESCRIPTION, MEMBER_DESCRIPTION } from "@/lib/help-wanted-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Help wanted — Camp 404" };

// Help wanted (owner's pick A, 2026-10-09): every team's roles for this year
// and who fills them, so the camp sees which teams still need a lead and which
// roles are open. Every approved member reads it and presses "I'm keen"; a
// captain or a lead of the team picks (components/help-wanted). What each
// viewer gets, who is keen above all, is cut on the server
// (lib/help-wanted.ts).

export default async function HelpWantedPage() {
  const { campUser, rank } = await captainPageGate("camp_member");
  const ledTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const view = await getHelpWantedView({
    userId: campUser.id,
    rank,
    ledTeams,
  });

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow={view.year === null ? "Camp" : `Camp · AfrikaBurn ${view.year}`}
        title="Help wanted"
        description={
          view.everyone === null ? MEMBER_DESCRIPTION : KEEPER_DESCRIPTION
        }
      />
      <HelpWantedBoard view={view} />
    </div>
  );
}
