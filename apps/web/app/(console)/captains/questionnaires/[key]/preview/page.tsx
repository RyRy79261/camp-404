import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { canViewBuilderDefinition } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { Card, CardContent } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { BuilderPreview } from "@/components/questionnaire/builder-preview";

export const dynamic = "force-dynamic";

export const metadata = { title: "Questionnaire preview — Camp 404" };

// Author preview — the real runner driven from empty answers, no persistence,
// no side-effects (BuilderPreview). Team-lead+ only: a lower rank gets the
// locked page (preview-but-locked, D3) and no definition is read. The form sits
// in a card at the width a member reads it, like the AfrikaBurn fill page.
export default async function BuilderPreviewPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { campUser, rank, cleared } = await captainPageGate("team_lead");
  const chrome = (title: string, children: ReactNode, actions?: ReactNode) => (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Questionnaires / Preview"
        title={title}
        description="What members see. Nothing you enter here is saved or sent."
        actions={actions}
      />
      {children}
    </div>
  );

  if (!cleared) {
    return chrome(
      "Preview",
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

  const backToEditor = (
    <Button asChild variant="outline">
      <Link href={`/captains/questionnaires/${key}`}>
        <Pencil aria-hidden />
        Back to editor
      </Link>
    </Button>
  );
  return chrome(
    definition.title || "Preview",
    <Card className="w-full max-w-2xl">
      <CardContent className="flex flex-col p-6">
        <BuilderPreview questionnaire={definition} />
      </CardContent>
    </Card>,
    backToEditor,
  );
}
