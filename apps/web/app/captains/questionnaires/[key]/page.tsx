import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { isTeamLead } from "@camp404/db/roster";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { BuilderCanvas } from "./builder-canvas";

export const dynamic = "force-dynamic";

// The build canvas (boards 50/54). Authoring is team-lead+ (preview-but-locked
// below); a team-lead may edit only their own drafts, a captain any. The
// definition is withheld server-side when the viewer can't edit. Only builder
// definitions open here — getBuilderDefinition returns null for a legacy code
// questionnaire (those are never in the hub anyway).
export default async function BuilderCanvasPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
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

  const chrome = (children: ReactNode) => (
    <main className="mx-auto max-w-lg px-4 py-6">
      <GhostBack href="/captains/questionnaires" className="-ml-2 mb-4">
        Questionnaires
      </GhostBack>
      {children}
    </main>
  );

  if (!canAuthor) {
    return chrome(
      <CaptainLock message="The questionnaire builder is for team leads and captains." />,
    );
  }

  const meta = await getDefinitionMetaRow(key);
  if (!meta) notFound();
  const definition = await getBuilderDefinition(key);
  if (!definition) notFound();

  const canEdit = rank === "captain" || meta.createdBy === campUser.id;
  if (!canEdit) {
    return chrome(
      <CaptainLock message="You can only edit your own drafts." />,
    );
  }

  return chrome(
    <BuilderCanvas
      questionnaireKey={key}
      definition={definition}
      canPublish={rank === "captain"}
    />,
  );
}
