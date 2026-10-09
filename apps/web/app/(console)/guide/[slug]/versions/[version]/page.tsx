import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { canEditGuideChapter } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { ChapterView } from "@/components/guide/chapter-view";
import { VersionsCard } from "@/components/guide/versions-card";
import { getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { getChapterVersion, listChapterVersions } from "@/lib/guide";
import {
  guideCategoryLabel,
  guideChapterPath,
  guideDay,
  guideEditPath,
  WHOLE_CAMP_LABEL,
} from "@/lib/guide-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Chapter version — Survival Guide" };

// One published version of a chapter, as it was (#250). Every approved member
// may open an old version of a chapter that is on the guide; a chapter taken
// off the guide is its writers' alone (a captain, or a lead of its team), so
// anyone else gets the not-found page.

export default async function GuideVersionPage({
  params,
}: {
  params: Promise<{ slug: string; version: string }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const { slug, version: raw } = await params;
  const number = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  const version = await getChapterVersion(slug, number);
  if (!version) notFound();
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canEdit = canEditGuideChapter(rank, leadTeams, version.chapter.team);
  if (!version.chapter.published && !canEdit) notFound();

  const [config, versions] = await Promise.all([
    getTeamsConfig(),
    listChapterVersions(version.documentId),
  ]);
  const team = version.team;
  const teamLabel = team
    ? (config.teams.find((t) => t.key === team)?.label ?? team)
    : WHOLE_CAMP_LABEL;
  const live = version.chapter.published
    ? version.chapter.publishedVersion
    : null;
  const back = live !== null ? guideChapterPath(slug) : guideEditPath(slug);

  return (
    <div className="mx-auto flex w-full max-w-[67.5rem] flex-col">
      <PageHeading
        eyebrow={`Survival Guide / ${guideCategoryLabel(version.category)}`}
        title={version.title}
        description={`${teamLabel} · Version ${version.version} · ${guideDay(version.publishedAt)}${version.publishedByName ? ` · ${version.publishedByName}` : ""}`}
        actions={
          <Button asChild variant="outline">
            <Link href={back}>
              <ArrowLeft aria-hidden />
              {live !== null ? "The chapter now" : "Back to the editor"}
            </Link>
          </Button>
        }
      />
      <div className="-mt-3 mb-6 flex flex-wrap gap-2">
        <Badge variant="warning" className="gap-1">
          <History className="h-3 w-3" aria-hidden />
          {live === version.version
            ? "This is the version on the guide"
            : live !== null
              ? `An old version: the guide shows version ${live}`
              : "This chapter is off the guide"}
        </Badge>
      </div>

      {/* A reading measure, as the chapter's own page keeps it. */}
      <div className="grid grid-cols-[minmax(0,44rem)] gap-6 page-lg:grid-cols-[minmax(0,44rem)_minmax(16rem,22rem)]">
        <div>
          <ChapterView
            kind={version.kind}
            card={version.card}
            markdown={version.markdown}
          />
        </div>
        <div className="flex flex-col gap-6">
          <VersionsCard
            slug={slug}
            versions={versions}
            current={version.version}
            live={live}
          />
        </div>
      </div>
    </div>
  );
}
