import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, BarChart3, ClipboardList } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { MemberResults } from "@/components/questionnaires/member-results";
import { programPage } from "@/lib/program-page";
import { loadMemberResults } from "@/lib/questionnaire-member-results";

export const dynamic = "force-dynamic";

export const metadata = { title: "Results — Camp 404" };

// A questionnaire's results, for the members who answered it (owner,
// 2026-10-23). The gate and the cut are `loadMemberResults`: a member who has
// not answered gets no answers read. A captain also has the full results page
// with names on every answer; this page links to it.
export default async function MemberResultsPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { campUser, rank, cleared } = await programPage(
    "questionnaire-results",
  );

  const back = (
    <Button asChild variant="outline">
      <Link href="/captains/questionnaires">
        <ArrowLeft aria-hidden />
        All questionnaires
      </Link>
    </Button>
  );
  const chrome = (
    title: string,
    description: string | undefined,
    children: ReactNode,
  ) => (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Questionnaires / Results"
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap gap-2">
            {rank === "captain" ? (
              <Button asChild variant="outline">
                <Link href={`/captains/questionnaires/${key}/metrics`}>
                  <BarChart3 aria-hidden />
                  Captains&apos; results
                </Link>
              </Button>
            ) : null}
            {back}
          </div>
        }
      />
      {children}
    </div>
  );

  if (!cleared) {
    return chrome(
      "Results",
      undefined,
      <CaptainLock
        title="Camp members only"
        message="Questionnaire results are for camp members."
      />,
    );
  }

  const access = await loadMemberResults(key, {
    userId: campUser.id,
    rank,
  });
  if (!access.ok) {
    return chrome(
      access.title,
      undefined,
      <EmptyState
        icon={<ClipboardList aria-hidden />}
        title={
          access.reason === "draft"
            ? "Not sent yet"
            : "Answer it to see the results"
        }
        description={
          access.reason === "draft"
            ? "Nobody has been asked this yet, so there are no answers."
            : "Everyone who answers this questionnaire sees its results. Answer it first: it is in your inbox or My forms when it is sent to you."
        }
      />,
    );
  }

  const { view } = access;
  const people = view.respondents === 1 ? "person" : "people";
  return chrome(
    view.title,
    `${view.respondents} ${people} answered. ${
      view.anonymous
        ? "Everyone who answered sees these results, with no names."
        : "Everyone who answered sees these results."
    }`,
    view.questions.length === 0 ? (
      <EmptyState
        icon={<ClipboardList aria-hidden />}
        title="Nothing to show here"
        description="Every question in this one fills in members' own details, which only captains read."
      />
    ) : view.respondents === 0 ? (
      <EmptyState
        icon={<ClipboardList aria-hidden />}
        title="No answers yet"
        description="Results show here as people answer."
      />
    ) : (
      <div className="flex flex-col gap-4">
        <MemberResults
          questions={view.questions}
          aggregate={view.aggregate}
          answers={view.answers}
          anonymous={view.anonymous}
        />
        <p className="text-xs text-muted-foreground">
          Questions that fill in members&apos; own details (contact details,
          dietary needs, whether they are coming) are not shown here.
        </p>
      </div>
    ),
  );
}
