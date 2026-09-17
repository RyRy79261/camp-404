import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { getOpenActivationForKey } from "@camp404/db/questionnaire-lifecycle";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { QuestionnaireBuilderV2 } from "@/components/questionnaires/builder";
import { captainPageGate } from "@/lib/captain-gate";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit questionnaire — Camp 404" };

// The builder, under the AfrikaBurn console's builder heading ("Questionnaires
// / New" until the first publish, "Questionnaires / Edit" after). Authoring is
// team-lead+ (preview-but-locked below); a team lead may edit only their own
// questionnaires, a captain any. The definition is withheld server-side when
// the viewer can't edit. Only builder definitions open here —
// getBuilderDefinition returns null for a code questionnaire's reserved key.
export default async function QuestionnaireBuilderPage({
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

  const chrome = (heading: { new: boolean }, children: ReactNode) => (
    <div className="flex flex-col">
      {heading.new ? (
        <PageHeading
          eyebrow="Questionnaires / New"
          title="Build a questionnaire"
          description="Sections, questions, rules and branching. Save a draft as you go, then publish it and send it to members."
        />
      ) : (
        <PageHeading
          eyebrow="Questionnaires / Edit"
          title="Edit questionnaire"
          description="Changes reach members when a captain re-publishes. A send already out keeps the version it went out with."
        />
      )}
      {children}
    </div>
  );

  if (!canAuthor) {
    return chrome(
      { new: false },
      <CaptainLock
        title="Team leads and captains only"
        message="The questionnaire builder is for team leads and captains."
      />,
    );
  }

  const meta = await getDefinitionMetaRow(key);
  if (!meta) notFound();
  const isNew = meta.status === "draft" && meta.version === null;

  const canEdit = rank === "captain" || meta.createdBy === campUser.id;
  if (!canEdit) {
    return chrome(
      { new: isNew },
      <CaptainLock
        title="Author and captains only"
        message="You can only edit your own drafts."
      />,
    );
  }

  const definition = await getBuilderDefinition(key);
  if (!definition) notFound();

  // Closing a send is captain-only, so only a captain's page reads the open
  // send it would close.
  const isCaptain = rank === "captain";
  const openActivation = isCaptain ? await getOpenActivationForKey(key) : null;

  return chrome(
    { new: isNew },
    <QuestionnaireBuilderV2
      initial={{
        key,
        definition,
        status: meta.status,
        version: meta.version,
      }}
      isCaptain={isCaptain}
      openActivationId={openActivation?.id ?? null}
      openActivationBlocking={openActivation?.blocking ?? null}
    />,
  );
}
