import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { flattenQuestions } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { getActivationById, getRequiredAction } from "@camp404/db/activations";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getPendingQuestionnaires,
  getPendingRequiredActions,
  hasCampAccess,
  isApproved,
} from "@/lib/users";
import { getPledgeStep } from "@/lib/pledge-step";
import { PledgeStep } from "@/components/dues/pledge-step";
import { nextGate } from "@/lib/required-actions";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { QueueCard } from "@/components/questionnaire/queue-card";
import { CompletionHero } from "./completion-hero";
import { SignOutLink } from "@/components/auth/sign-out-link";
import { OutsideBlockingLayer } from "@/components/questionnaire/outside-blocking-layer";
import { RunnerFrame } from "../runner-frame";

export const dynamic = "force-dynamic";

export const metadata = { title: "Questionnaire complete — Camp 404" };

// Where every finished questionnaire lands (owner's call, 2026-09-16: beside
// the runner, at /questionnaires/[activationId]/complete).
//
// Section A says it is done and what is next: the next REQUIRED questionnaire
// if one still holds the app, otherwise back to camp. Section B is the queue:
// the one just finished, then every questionnaire still waiting. Of the
// required ones, only the first can be opened (the gate spine sends a member
// to the oldest one first), so the rest show as locked. Optional ones can be
// opened in any order.
export default async function QuestionnaireCompletePage({
  params,
}: {
  params: Promise<{ activationId: string }>;
}) {
  const { activationId } = await params;
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }

  const activation = await getActivationById(activationId);
  if (!activation) redirect("/");
  // An optional questionnaire (#313) has no gate to complete: its thank-you
  // is the strip on My forms.
  if (activation.scope === "opt_in") {
    redirect(`/tools/forms?answered=${activation.id}`);
  }
  // Only a member who has finished THIS send sees its completion screen.
  // Anyone else goes to the form, which explains their own state.
  const own = await getRequiredAction(campUser.id, activation.questionnaireKey);
  if (own?.status !== "completed" || own.activationId !== activation.id) {
    redirect(`/questionnaires/${activation.id}`);
  }

  const [pending, gates, builder] = await Promise.all([
    getPendingQuestionnaires(campUser.id),
    getPendingRequiredActions(campUser.id),
    getBuilderDefinition(activation.questionnaireKey),
  ]);
  const next = nextGate(gates);
  const required = pending.filter((q) => q.blocking);
  // "Coming this year?" answered Coming: "What can you commit?" comes next
  // (camp fees sprint, mock-up step 3), until they have pledged. Any form
  // that asks the participation_intent question leads here; the pledge is
  // the member's own write (savePledgeAction), for an approved member.
  const asksIntent =
    builder !== null &&
    flattenQuestions(builder).some(
      (q) => "role" in q && q.role === "participation_intent",
    );
  const pledgeStep =
    asksIntent && isApproved(campUser, authUser.primaryEmail)
      ? await getPledgeStep(campUser.id)
      : null;

  // Bare and full-screen while a required questionnaire still holds the app;
  // in the console once nothing does (RunnerFrame).
  return (
    <RunnerFrame className="max-w-xl gap-6">
      <Card>
        <CardContent className="p-8">
          <CompletionHero
            variant={next ? "more-required" : "all-done"}
            pendingCount={gates.filter((g) => g.blocking).length}
            nextHref={next ?? undefined}
          />
        </CardContent>
      </Card>

      {pledgeStep && !pledgeStep.pledge && !pledgeStep.amountLocked && (
        <section aria-label="Your pledge" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            You said you&rsquo;re coming. One more step: what can you put in?
            Nothing is charged until the captains give you a place, and you can
            change it on My dues until then.
          </p>
          <PledgeStep
            scale={pledgeStep.scale}
            burnYear={pledgeStep.burnYear}
            pledge={null}
            knownPayBy={pledgeStep.knownPayBy}
          />
        </section>
      )}

      {/* A builder questionnaire's results open to everyone who answered
          (owner, 2026-10-23), once nothing holds the app. */}
      {builder && !next ? (
        <Button asChild variant="outline" className="self-center">
          <Link href={`/questionnaires/results/${activation.questionnaireKey}`}>
            <BarChart3 aria-hidden />
            See the results
          </Link>
        </Button>
      ) : null}

      {pending.length > 0 && (
        <section
          aria-labelledby="queue-heading"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="queue-heading"
              className="text-base font-semibold normal-case tracking-normal"
            >
              {required.length > 0
                ? "Finish these to unlock the app"
                : "Still waiting on you"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {required.length > 0
                ? "A captain needs all of these from you."
                : "These are optional, but a captain would like your answers."}
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            <li>
              <QueueCard
                title={activation.title}
                status="complete"
                blocking={activation.blocking}
                completedAt={own.completedAt}
              />
            </li>
            {pending.map((q) => {
              const href = `/questionnaires/${q.activationId}`;
              const status = q.blocking && href !== next ? "locked" : "next-up";
              return (
                <li key={q.activationId}>
                  <QueueCard
                    title={q.title}
                    status={status}
                    blocking={q.blocking}
                    dueAt={q.dueAt}
                    href={status === "next-up" ? href : undefined}
                  />
                </li>
              );
            })}
          </ul>
          {required.length > 0 && (
            <div className="flex flex-col items-center gap-3 pt-1 text-center">
              <p className="text-xs text-muted-foreground">
                You can&rsquo;t use Camp 404 until every required questionnaire
                is done.
              </p>
              <OutsideBlockingLayer>
                <SignOutLink className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground" />
              </OutsideBlockingLayer>
            </div>
          )}
        </section>
      )}
    </RunnerFrame>
  );
}
