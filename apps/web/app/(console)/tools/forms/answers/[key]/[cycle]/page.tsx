import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { displayResponseValue, getQuestionBlocks } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent, CardHeader } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cn } from "@camp404/ui/lib/utils";
import { getAnsweredQuestionnaire } from "@/lib/forms";
import { requireMemberPage } from "@/lib/member-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your answers — Camp 404" };

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CAMP_TIME_ZONE,
});

// A finished builder questionnaire, read-only (WP4.replay): what this member
// answered, shown against the version they answered, one card per page with
// each question beside its answer (the AfrikaBurn response viewer's question
// and answer list). Answers are fixed once submitted, so there is nothing to
// edit here. Only the member's own answers are ever read; another member's key
// or year is a 404.
export default async function AnsweredQuestionnairePage({
  params,
}: {
  params: Promise<{ key: string; cycle: string }>;
}) {
  const { key, cycle: rawCycle } = await params;

  const { campUser } = await requireMemberPage();

  const cycle = Number(rawCycle);
  if (!Number.isInteger(cycle) || cycle < 1) notFound();
  const answers = await getAnsweredQuestionnaire(
    campUser.id,
    decodeURIComponent(key),
    cycle,
  );
  if (!answers) notFound();

  const pages = answers.questionnaire.pages
    .map((page) => ({ page, questions: getQuestionBlocks(page) }))
    .filter((p) => p.questions.length > 0);

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/tools/forms">
            <ArrowLeft aria-hidden />
            My forms
          </Link>
        </Button>
      </div>

      <div className="[overflow-wrap:anywhere]">
        <PageHeading
          eyebrow="Tools / My forms"
          title={answers.questionnaire.title}
          description={`Submitted ${dateFmt.format(answers.completedAt)}. Answers are fixed once submitted.`}
        />
      </div>

      <div className="flex flex-col gap-6">
        {pages.map(({ page, questions }) => (
          <Card key={page.id}>
            {page.title && (
              <CardHeader>
                <h2 className="text-base font-semibold normal-case leading-snug tracking-normal [overflow-wrap:anywhere]">
                  {page.title}
                </h2>
              </CardHeader>
            )}
            <CardContent className={cn(!page.title && "pt-6")}>
              <dl className="flex flex-col divide-y divide-border">
                {questions.map((question) => (
                  <div
                    key={question.id}
                    className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-3 sm:gap-6"
                  >
                    <dt className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                      {question.prompt}
                    </dt>
                    <dd className="whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere] sm:col-span-2">
                      {displayResponseValue(
                        question,
                        answers.responses[question.id],
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
