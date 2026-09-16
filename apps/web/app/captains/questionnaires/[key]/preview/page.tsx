import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import {
  canViewBuilderDefinition,
  deriveViewerRank,
  requireClearance,
} from "@camp404/core";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
// Via the lib facade so E2E reads the test store, not Neon — see the note on
// the same import in ../../page.tsx.
import {
  ensureCampUser,
  hasCampAccess,
  isApproved,
  isTeamLead,
} from "@/lib/users";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { BuilderPreview } from "@/components/questionnaire/builder-preview";

export const dynamic = "force-dynamic";

// Author preview — the real runner driven from empty answers, no persistence,
// no side-effects (BuilderPreview). Team-lead+ only: a lower rank gets the
// locked page chrome (preview-but-locked, D3) and no definition is read.
export default async function BuilderPreviewPage({
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
  const chrome = (children: ReactNode) => (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <GhostBack
        href={`/captains/questionnaires/${key}`}
        className="-ml-2 mb-4"
      >
        Back to editor
      </GhostBack>
      {children}
    </main>
  );

  const rank = deriveViewerRank(campUser.rank, await isTeamLead(campUser.id));
  if (!requireClearance(rank, "team_lead").cleared) {
    return chrome(
      <CaptainLock message="Questionnaire previews are for team leads and captains." />,
    );
  }

  const meta = await getDefinitionMetaRow(key);
  if (!meta) notFound();
  // The hub's visibility rule: never another author's private draft.
  if (!canViewBuilderDefinition({ rank, userId: campUser.id }, meta)) {
    notFound();
  }

  const definition = await getBuilderDefinition(key);
  if (!definition) notFound();

  return chrome(<BuilderPreview questionnaire={definition} />);
}
