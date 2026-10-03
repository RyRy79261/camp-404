import { canEditAnyGuideChapter, canEditGuideChapter } from "@camp404/core";
import { Team } from "@camp404/types";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { ChapterEditor, WHOLE_CAMP } from "@/components/guide/chapter-editor";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "New chapter — Survival Guide" };

// Start a Survival Guide chapter or a duty card (#250). The page offers only
// the teams this writer may write for: the teams they lead this year, or, for
// a captain, every active team and the whole camp. Anyone else sees the
// heading and a lock. The action checks the rule again, and the write once
// more inside its transaction.

export default async function NewGuideChapterPage() {
  const { campUser, rank, cleared } = await captainPageGate("team_lead");
  const leadTeams =
    cleared && rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  if (!cleared || !canEditAnyGuideChapter(rank, leadTeams)) {
    return (
      <div className="flex flex-col">
        <PageHeading eyebrow="Camp / Survival Guide" title="New chapter" />
        <CaptainLock
          title="Captains and team leads only"
          message="Captains write the Survival Guide, and each team's leads write their team's chapters."
        />
      </div>
    );
  }
  const config = await getTeamsConfig();
  const teams = activeTeams(config)
    .filter((t) => Team.safeParse(t.key).success)
    .filter((t) => canEditGuideChapter(rank, leadTeams, t.key))
    .map((t) => ({ value: t.key, label: t.label }));
  const isCaptain = rank === "captain";

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / Survival Guide"
        title="New chapter"
        description="Write it as a draft and publish it when it is ready. Members read only what is published."
      />
      <ChapterEditor
        mode={{ kind: "new" }}
        initial={{
          kind: "chapter",
          title: "",
          category: "on_site",
          team: isCaptain ? WHOLE_CAMP : (teams[0]?.value ?? WHOLE_CAMP),
          markdown: "",
          card: {
            subRoles: [],
            steps: [],
            hardRules: [],
            checklist: [],
            askRole: "",
          },
        }}
        teams={teams}
        canPickWholeCamp={isCaptain}
        canSetPublic={false}
      />
    </div>
  );
}
