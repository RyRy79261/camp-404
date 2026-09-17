import { redirect } from "next/navigation";
import { Divider } from "@camp404/ui/components/divider";
import { getActivationById, getRequiredAction } from "@camp404/db/activations";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getPendingQuestionnaires,
  getPendingRequiredActions,
  hasCampAccess,
} from "@/lib/users";
import { nextGate } from "@/lib/required-actions";
import { QueueCard } from "@/components/questionnaire/queue-card";
import { CompletionHero } from "./completion-hero";
import { SignOutLink } from "@/components/auth/sign-out-link";

export const dynamic = "force-dynamic";

export const metadata = { title: "Questionnaire complete — Camp 404" };

// Board S27: where every finished questionnaire lands (owner's call,
// 2026-09-16: beside the runner, at /questionnaires/[activationId]/complete).
//
// Section A says it is done and what is next: the next REQUIRED questionnaire
// if one still holds the app, otherwise back to camp. Section B is the queue:
// the one just finished, then every questionnaire still waiting. Of the
// required ones, only the first can be opened (the gate spine sends a member
// to the oldest one first), so the rest show as locked, as the board draws.
// Optional ones can be opened in any order.
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
  // Only a member who has finished THIS send sees its completion screen.
  // Anyone else goes to the form, which explains their own state.
  const own = await getRequiredAction(campUser.id, activation.questionnaireKey);
  if (own?.status !== "completed" || own.activationId !== activation.id) {
    redirect(`/questionnaires/${activation.id}`);
  }

  const [pending, gates] = await Promise.all([
    getPendingQuestionnaires(campUser.id),
    getPendingRequiredActions(campUser.id),
  ]);
  const next = nextGate(gates);
  const required = pending.filter((q) => q.blocking);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-6 px-6 py-6">
      <CompletionHero
        variant={next ? "more-required" : "all-done"}
        pendingCount={gates.filter((g) => g.blocking).length}
        nextHref={next ?? undefined}
      />

      {pending.length > 0 && (
        <>
          <Divider />
          <section
            aria-labelledby="queue-heading"
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <h2 id="queue-heading" className="text-xl font-bold">
                {required.length > 0
                  ? "Finish these to unlock the app"
                  : "Still waiting on you"}
              </h2>
              <p className="text-label text-muted-foreground">
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
                const status =
                  q.blocking && href !== next ? "locked" : "next-up";
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
              <div className="flex flex-col items-center gap-3.5 pt-1 text-center">
                <p className="text-caption text-muted-foreground">
                  You can&rsquo;t use Camp 404 until every required
                  questionnaire is done.
                </p>
                <SignOutLink className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground" />
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
