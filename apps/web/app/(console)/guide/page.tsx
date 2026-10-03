import Link from "next/link";
import { BookOpen, FilePen, Plus, Printer, Search } from "lucide-react";
import {
  canEditAnyGuideChapter,
  canEditGuideChapter,
  guideReadMark,
  guideReviewDue,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { Input } from "@camp404/ui/components/input";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { ChapterRow } from "@/components/guide/chapter-row";
import { GuideTabs, type GuideGrouping } from "@/components/guide/guide-tabs";
import { getCurrentCycle, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import {
  listChapterReads,
  listGuideDrafts,
  listPublishedChapters,
  listPublishedDutyCards,
} from "@/lib/guide";
import {
  DUTY_CARDS_PRINT_PATH,
  GUIDE_PATH,
  guideCategoryLabel,
  guideEditPath,
  groupByTeam,
  groupByTopic,
  NEW_GUIDE_CHAPTER_PATH,
  WHOLE_CAMP_LABEL,
} from "@/lib/guide-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Survival Guide — Camp 404" };

// The Survival Guide (#250): the camp's chapters, from before you leave home
// to strike, for every approved member. Grouped by topic or by team, with a
// search, and a New or Updated mark beside a chapter this member has not read
// since it was last published. Captains write every chapter and a team's
// leads write their team's; they also get their drafts and the chapters still
// to check this year beside the contents. The composition is the About page's:
// the main cards on the left, the short lists beside.
//
// Drafts are read for writers only, and only the ones this writer may change
// leave the server.

export default async function GuidePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; by?: string }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const { q, by: requested } = await searchParams;
  const query = (q ?? "").trim().slice(0, 100);
  const by: GuideGrouping = requested === "team" ? "team" : "topic";

  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const writer = canEditAnyGuideChapter(rank, leadTeams);
  const [chapters, reads, config, cycle, drafts, dutyCards] = await Promise.all(
    [
      listPublishedChapters({ query }),
      listChapterReads(campUser.id),
      getTeamsConfig(),
      getCurrentCycle(),
      writer ? listGuideDrafts() : Promise.resolve([]),
      listPublishedDutyCards(),
    ],
  );
  const teams = config.teams.map((t) => ({ key: t.key, label: t.label }));
  const teamLabel = (team: string | null) =>
    team === null
      ? WHOLE_CAMP_LABEL
      : (teams.find((t) => t.key === team)?.label ?? team);

  const groups =
    by === "team" ? groupByTeam(chapters, teams) : groupByTopic(chapters);
  const mine = drafts.filter((d) =>
    canEditGuideChapter(rank, leadTeams, d.team),
  );
  const unpublished = mine.filter((d) => !d.published || d.changedSincePublish);
  const year = cycle?.year ?? null;
  const toCheck = mine.filter(
    (d) =>
      d.published &&
      !d.changedSincePublish &&
      guideReviewDue(d.cycleReviewed, year),
  );

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / Survival Guide"
        title="Survival Guide"
        description="What every member needs to know, from before you leave home to strike. Captains write it, and each team's leads write their team's chapters."
        actions={
          <>
            {/* Every published duty card, one per A4 page, in one PDF. */}
            {dutyCards.length > 0 ? (
              <Button asChild variant="outline">
                <Link
                  href={DUTY_CARDS_PRINT_PATH}
                  target="_blank"
                  rel="noopener"
                >
                  <Printer aria-hidden />
                  Print all duty cards
                </Link>
              </Button>
            ) : null}
            {writer ? (
              <Button asChild>
                <Link href={NEW_GUIDE_CHAPTER_PATH}>
                  <Plus aria-hidden />
                  New chapter
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 page-sm:flex-row page-sm:items-center page-sm:justify-between">
        <form
          action={GUIDE_PATH}
          role="search"
          className="flex w-full gap-2 page-sm:max-w-md"
        >
          {by === "team" ? (
            <input type="hidden" name="by" value="team" />
          ) : null}
          <Input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search the guide"
            aria-label="Search the guide"
            maxLength={100}
          />
          <Button type="submit" variant="outline">
            <Search aria-hidden />
            Search
          </Button>
        </form>
        <GuideTabs by={by} query={query} />
      </div>

      <div
        className={
          writer
            ? "grid grid-cols-[minmax(0,1fr)] gap-6 page-lg:grid-cols-3"
            : "flex flex-col gap-6"
        }
      >
        <div className="flex flex-col gap-6 page-lg:col-span-2">
          {groups.length === 0 ? (
            <EmptyState
              icon={<BookOpen />}
              title={
                query
                  ? `Nothing in the guide mentions "${query}"`
                  : "No chapters yet"
              }
              description={
                query
                  ? "Try another word, or clear the search."
                  : "When a captain or a team lead publishes a chapter, it is listed here."
              }
            />
          ) : (
            groups.map((group) => (
              <Card key={group.key}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-base">{group.label}</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <ul
                    aria-label={group.label}
                    className="divide-y divide-border"
                  >
                    {group.chapters.map((c) => (
                      <li key={c.id}>
                        <ChapterRow
                          slug={c.slug}
                          title={c.title}
                          kind={c.kind}
                          mark={guideReadMark(c.version, reads[c.id])}
                          aside={
                            by === "team"
                              ? guideCategoryLabel(c.category)
                              : teamLabel(c.team)
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {writer ? (
          <div className="flex flex-col gap-6">
            <Card role="region" aria-labelledby="guide-drafts">
              <CardHeader className="pb-1">
                <CardTitle
                  id="guide-drafts"
                  className="flex items-center gap-2 text-base"
                >
                  <FilePen className="h-4 w-4 text-accent" aria-hidden />
                  Your drafts
                </CardTitle>
                <CardDescription>
                  Chapters you can write that members can&apos;t read yet, or
                  that changed since they were published.
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-3">
                {unpublished.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing waiting to be published.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {unpublished.map((d) => (
                      <li
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                      >
                        <Link
                          href={guideEditPath(d.slug)}
                          className="font-medium hover:text-accent"
                        >
                          {d.title}
                        </Link>
                        <Badge variant="outline">
                          {!d.published && d.publishedVersion !== null
                            ? "Taken off"
                            : d.published
                              ? "Changes not published"
                              : "Draft"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {year !== null ? (
              <Card role="region" aria-labelledby="guide-check">
                <CardHeader className="pb-1">
                  <CardTitle id="guide-check" className="text-base">
                    To check for {year}
                  </CardTitle>
                  <CardDescription>
                    Last year&apos;s chapters stay in the guide. Read each one
                    again, then keep it as it is or publish a new version.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-3">
                  {toCheck.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Every chapter you write is checked for this year.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {toCheck.map((d) => (
                        <li key={d.id} className="py-2.5 text-sm">
                          <Link
                            href={guideEditPath(d.slug)}
                            className="font-medium hover:text-accent"
                          >
                            {d.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
