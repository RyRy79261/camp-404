import { redirect } from "next/navigation";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { isTeamLead } from "@camp404/db/roster";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { listDefinitionsForViewer } from "@/lib/questionnaire-definitions";
import { QuestionnaireHub, type HubItem } from "./questionnaire-hub";

export const dynamic = "force-dynamic";

export const metadata = { title: "Questionnaires — Camp 404" };

// The questionnaire-builder hub (board 49). Authoring is team-lead+ (preview-but-
// locked for everyone below); only captains publish/send (Phase D). Data is
// withheld server-side when the viewer can't author. Team-leads see published
// questionnaires + their own drafts; captains see everything (reserved code keys
// excluded by the facade either way).
const EDITED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function QuestionnairesPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }

  const rank = deriveViewerRank(campUser.rank, await isTeamLead(campUser.id));
  const canAuthor = requireClearance(rank, "team_lead").cleared;
  const canSeeAll = rank === "captain";

  const items: HubItem[] = canAuthor
    ? (
        await listDefinitionsForViewer({ userId: campUser.id, canSeeAll })
      ).map((d) => ({
        key: d.key,
        title: d.title,
        status: d.status,
        questionCount: d.questionCount,
        editedLabel: EDITED.format(d.updatedAt),
        canDelete: d.status === "draft",
      }))
    : [];

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <GhostBack href="/captains/tools" className="-ml-2 mb-4">
        Camp tools
      </GhostBack>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Questionnaires</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build and manage the custom questionnaires your camp uses to collect
          answers from members.
        </p>
      </header>

      {canAuthor ? (
        <QuestionnaireHub items={items} />
      ) : (
        <CaptainLock message="The questionnaire builder is for team leads and captains. Your rank doesn't have clearance for this." />
      )}
    </main>
  );
}
