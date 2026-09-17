import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { canViewBuilderDefinition } from "@camp404/core";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { captainPageGate } from "@/lib/captain-gate";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { BuilderPreview } from "@/components/questionnaire/builder-preview";

export const dynamic = "force-dynamic";

export const metadata = { title: "Questionnaire preview — Camp 404" };

// Author preview — the real runner driven from empty answers, no persistence,
// no side-effects (BuilderPreview). Team-lead+ only: a lower rank gets the
// locked page chrome (preview-but-locked, D3) and no definition is read.
export default async function BuilderPreviewPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { campUser, rank, cleared } = await captainPageGate("team_lead");
  const chrome = (children: ReactNode) => (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <GhostBack
        linkAs={Link}
        href={`/captains/questionnaires/${key}`}
        className="-ml-2 mb-4"
      >
        Back to editor
      </GhostBack>
      {children}
    </main>
  );

  if (!cleared) {
    return chrome(
      <CaptainLock
        title="Team leads and captains only"
        message="Questionnaire previews are for team leads and captains."
      />,
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
