import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { getOpenActivationForKey } from "@camp404/db/questionnaire-lifecycle";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { QuestionnaireBuilderV2 } from "@/components/questionnaires/builder";
import { programPage } from "@/lib/program-page";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit questionnaire — Camp 404" };

// The builder, under the AfrikaBurn console's builder heading ("Questionnaires
// / New" until the first send, "Questionnaires / Edit" after). Authoring is
// team-lead+ (preview-but-locked below); a team lead may edit only their own
// questionnaires, a captain any. Anyone else who opens it is sent to its
// read-only view: every member may read every questionnaire (owner,
// 2026-10-23). Only builder definitions open here — getBuilderDefinition
// returns null for a code questionnaire's reserved key.
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
  } = await programPage("edit-questionnaire");

  const chrome = (heading: { new: boolean }, children: ReactNode) => (
    <div className="flex flex-col">
      {heading.new ? (
        <PageHeading
          eyebrow="Questionnaires / New"
          title="Build a questionnaire"
          description="Sections, questions, rules and branching. Save a draft as you go, then send it to members."
        />
      ) : (
        <PageHeading
          eyebrow="Questionnaires / Edit"
          title="Edit questionnaire"
          description="Changes reach members when you send them. A send already out keeps the version it went out with until then."
        />
      )}
      {children}
    </div>
  );

  const meta = await getDefinitionMetaRow(key);
  if (!meta) notFound();
  const isNew = meta.status === "draft" && meta.version === null;

  const canEdit =
    canAuthor && (rank === "captain" || meta.createdBy === campUser.id);
  if (!canEdit) redirect(`/captains/questionnaires/${key}/preview`);

  const definition = await getBuilderDefinition(key);
  if (!definition) notFound();

  const isCaptain = rank === "captain";
  const openActivation = await getOpenActivationForKey(key);

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
      anonymousResults={meta.anonymousResults}
      openActivationId={openActivation?.id ?? null}
      openActivationBlocking={openActivation?.blocking ?? null}
    />,
  );
}
