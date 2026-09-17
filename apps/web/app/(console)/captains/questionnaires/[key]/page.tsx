import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { getOpenActivationForKey } from "@camp404/db/questionnaire-lifecycle";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { BuilderCanvas } from "./builder-canvas";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit questionnaire — Camp 404" };

// The build canvas, under the AfrikaBurn console's builder heading
// ("Questionnaires / Edit"). Authoring is team-lead+ (preview-but-locked
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
  const {
    campUser,
    rank,
    cleared: canAuthor,
  } = await captainPageGate("team_lead");

  // The nav's Questionnaires entry is the way back to the hub. The canvas lays
  // itself out across the console's width (pages, and a rail beside them).
  const chrome = (children: ReactNode) => (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Questionnaires / Edit"
        title="Edit questionnaire"
        description="Pages, questions and branching. Changes save as you go, and members see them once you publish."
      />
      {children}
    </div>
  );

  if (!canAuthor) {
    return chrome(
      <CaptainLock
        title="Team leads and captains only"
        message="The questionnaire builder is for team leads and captains."
      />,
    );
  }

  const meta = await getDefinitionMetaRow(key);
  if (!meta) notFound();
  const definition = await getBuilderDefinition(key);
  if (!definition) notFound();

  const canEdit = rank === "captain" || meta.createdBy === campUser.id;
  if (!canEdit) {
    return chrome(
      <CaptainLock
        title="Author and captains only"
        message="You can only edit your own drafts."
      />,
    );
  }

  // Lifecycle is captain-only; the open activation (if any) drives the Send vs.
  // close-and-resend affordance.
  const isCaptain = rank === "captain";
  const openActivation = isCaptain ? await getOpenActivationForKey(key) : null;

  return chrome(
    <BuilderCanvas
      questionnaireKey={key}
      definition={definition}
      canPublish={isCaptain}
      status={meta.status}
      publishedVersion={meta.version}
      openActivationId={openActivation?.id ?? null}
      openActivationBlocking={openActivation?.blocking ?? null}
    />,
  );
}
