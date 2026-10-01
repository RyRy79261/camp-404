import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import {
  canEditAnyGuideChapter,
  canEditGuideChapter,
  guideReviewDue,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { ChapterView } from "@/components/guide/chapter-view";
import { ReviewButton } from "@/components/guide/review-button";
import { VersionsCard } from "@/components/guide/versions-card";
import { getCurrentCycle, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getGuideDraft,
  getPublishedChapter,
  recordChapterReadAfterResponse,
} from "@/lib/guide";
import {
  GUIDE_PATH,
  guideCategoryLabel,
  guideDay,
  guideEditPath,
  WHOLE_CAMP_LABEL,
} from "@/lib/guide-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const chapter = await getPublishedChapter(slug);
  return {
    title: chapter
      ? `${chapter.title} — Survival Guide`
      : "Survival Guide — Camp 404",
  };
}

// One chapter of the Survival Guide as members read it (#250): its published
// version, never a writer's unpublished draft. Opening it clears its New or
// Updated mark for this member (written after the page goes out). The
// composition is the About page's: the words on the left, the versions beside.
// A writer who may change it gets Edit, and "Still right for <year>" when it
// was last checked in an earlier year. A writer opening a chapter that is not
// on the guide is sent to its editor; anyone else gets the not-found page.

export default async function GuideChapterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const { slug } = await params;
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const [chapter, config, cycle] = await Promise.all([
    getPublishedChapter(slug),
    getTeamsConfig(),
    getCurrentCycle(),
  ]);
  if (!chapter) {
    if (canEditAnyGuideChapter(rank, leadTeams)) {
      const draft = await getGuideDraft(slug);
      if (draft && canEditGuideChapter(rank, leadTeams, draft.team)) {
        redirect(guideEditPath(slug));
      }
    }
    notFound();
  }
  recordChapterReadAfterResponse({
    userId: campUser.id,
    documentId: chapter.id,
    version: chapter.version,
  });

  const canEdit = canEditGuideChapter(rank, leadTeams, chapter.team);
  const teamLabel = chapter.team
    ? (config.teams.find((t) => t.key === chapter.team)?.label ?? chapter.team)
    : WHOLE_CAMP_LABEL;
  const year = cycle?.year ?? null;
  const checked = year !== null && chapter.cycleReviewed === year;
  const reviewDue = canEdit && guideReviewDue(chapter.cycleReviewed, year);

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow={`Survival Guide / ${guideCategoryLabel(chapter.category)}`}
        title={chapter.title}
        description={`${teamLabel} · Version ${chapter.version} · ${guideDay(chapter.publishedAt)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={GUIDE_PATH}>
                <ArrowLeft aria-hidden />
                Contents
              </Link>
            </Button>
            {canEdit ? (
              <Button asChild>
                <Link href={guideEditPath(chapter.slug)}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div
        className="-mt-3 mb-6 flex flex-wrap gap-2"
        aria-label="About this chapter"
      >
        {chapter.kind === "duty_card" ? (
          <Badge variant="outline">Duty card</Badge>
        ) : null}
        {checked ? <Badge variant="outline">Checked for {year}</Badge> : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 page-lg:grid-cols-3">
        <div className="page-lg:col-span-2">
          <ChapterView
            kind={chapter.kind}
            card={chapter.card}
            markdown={chapter.markdown}
          />
        </div>
        <div className="flex flex-col gap-6">
          {reviewDue && year !== null ? (
            <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
              <p>
                {chapter.cycleReviewed
                  ? `Last checked for ${chapter.cycleReviewed}.`
                  : `Not checked for ${year} yet.`}{" "}
                Read it again: keep it, or edit it and publish a new version.
              </p>
              <ReviewButton slug={chapter.slug} year={year} />
            </div>
          ) : null}
          <VersionsCard
            slug={chapter.slug}
            versions={chapter.versions}
            current={chapter.version}
            live={chapter.version}
          />
        </div>
      </div>
    </div>
  );
}
