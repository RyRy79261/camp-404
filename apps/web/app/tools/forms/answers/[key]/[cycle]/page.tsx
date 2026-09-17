import Link from "next/link";
import { notFound } from "next/navigation";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { displayResponseValue, getQuestionBlocks } from "@camp404/types";
import { GhostBack } from "@camp404/ui/components/ghost-back";
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
// answered, shown against the version they answered, page by page. Answers are
// fixed once submitted, so there is nothing to edit here. Only the member's own
// answers are ever read; another member's key or year is a 404.
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
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <GhostBack linkAs={Link} href="/tools/forms" className="-ml-2">
        My forms
      </GhostBack>

      <div className="flex flex-col gap-5 pt-2">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold [overflow-wrap:anywhere]">
            {answers.questionnaire.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Submitted {dateFmt.format(answers.completedAt)}. Answers are fixed
            once submitted.
          </p>
        </header>

        {pages.map(({ page, questions }) => (
          <section key={page.id} className="flex flex-col gap-3">
            {page.title && (
              <h2 className="text-base font-bold text-foreground">
                {page.title}
              </h2>
            )}
            <dl className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              {questions.map((question) => (
                <div key={question.id} className="flex flex-col gap-0.5">
                  <dt className="text-label text-muted-foreground">
                    {question.prompt}
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]">
                    {displayResponseValue(
                      question,
                      answers.responses[question.id],
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </main>
  );
}
