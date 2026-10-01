import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import {
  canEditAnyGuideChapter,
  canEditGuideChapter,
  canSetGuideChapterPublic,
} from "@camp404/core";
import { Team } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { ChapterEditor, WHOLE_CAMP } from "@/components/guide/chapter-editor";
import { VersionsCard } from "@/components/guide/versions-card";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { getGuideDraft, listChapterVersions } from "@/lib/guide";
import { guideChapterPath, KIND_LABEL } from "@/lib/guide-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit chapter — Survival Guide" };

// Edit a Survival Guide chapter (#250): its working copy, which members do
// not read until it is published. A captain edits any chapter; a lead only
// their own team's. Anyone else sees the heading and a lock, and the server
// sends them nothing of the draft. The writes check the rule again inside
// their transactions. The versions sit beside the editor, as on the reader.

export default async function EditGuideChapterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { campUser, rank, cleared } = await captainPageGate("team_lead");
  const { slug } = await params;
  const leadTeams =
    cleared && rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const lock = (message: string) => (
    <div className="flex flex-col">
      <PageHeading eyebrow="Camp / Survival Guide" title="Edit chapter" />
      <CaptainLock
        title="Captains and this team's leads only"
        message={message}
      />
    </div>
  );
  if (!cleared || !canEditAnyGuideChapter(rank, leadTeams)) {
    return lock(
      "Captains write the Survival Guide, and each team's leads write their team's chapters.",
    );
  }
  const draft = await getGuideDraft(slug);
  if (!draft) notFound();
  if (!canEditGuideChapter(rank, leadTeams, draft.team)) {
    return lock(
      draft.team === null
        ? "A whole-camp chapter is the captains' to write."
        : "Only captains and this team's leads can edit its chapters.",
    );
  }

  const [config, versions] = await Promise.all([
    getTeamsConfig(),
    listChapterVersions(draft.id),
  ]);
  const teams = activeTeams(config)
    .filter((t) => Team.safeParse(t.key).success)
    .filter((t) => canEditGuideChapter(rank, leadTeams, t.key))
    .map((t) => ({ value: t.key, label: t.label }));
  // A chapter of an archived team keeps its team on offer.
  if (draft.team && !teams.some((t) => t.value === draft.team)) {
    teams.push({
      value: draft.team,
      label:
        config.teams.find((t) => t.key === draft.team)?.label ?? draft.team,
    });
  }
  const isCaptain = rank === "captain";

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow={`Camp / Survival Guide / ${KIND_LABEL[draft.kind]}`}
        title={draft.title}
        description={
          draft.published
            ? draft.changedSincePublish
              ? "Members read the last published version. Publish to show them these changes."
              : "Members read this. A change shows once you publish it."
            : draft.publishedVersion !== null
              ? "Off the guide. Publish to put it back."
              : "A draft: members can't read it yet."
        }
        actions={
          draft.published ? (
            <Button asChild variant="outline">
              <Link href={guideChapterPath(draft.slug)}>
                <Eye aria-hidden />
                As members read it
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 page-lg:grid-cols-3">
        <div className="page-lg:col-span-2">
          <ChapterEditor
            key={`${draft.slug}:${draft.version}`}
            mode={{
              kind: "edit",
              slug: draft.slug,
              version: draft.version,
              published: draft.published,
              everPublished: draft.publishedVersion !== null,
              changedSincePublish: draft.changedSincePublish,
              public: draft.public,
            }}
            initial={{
              kind: draft.kind,
              title: draft.title,
              category: draft.category,
              team: draft.team ?? WHOLE_CAMP,
              markdown: draft.markdown,
              card: draft.card,
            }}
            teams={teams}
            canPickWholeCamp={isCaptain}
            canSetPublic={canSetGuideChapterPublic(rank)}
          />
        </div>
        <div className="flex flex-col gap-6">
          {versions.length > 0 ? (
            <VersionsCard
              slug={draft.slug}
              versions={versions}
              current={-1}
              live={draft.published ? draft.publishedVersion : null}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Not published yet. Each publish that changes the chapter is kept
              as a version here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
