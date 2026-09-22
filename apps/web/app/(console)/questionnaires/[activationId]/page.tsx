import { redirect } from "next/navigation";
import { flattenQuestions, type QuestionnaireResponses } from "@camp404/types";
import { Card, CardContent } from "@camp404/ui/components/card";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getPendingRequiredActions,
  hasCampAccess,
  syncOpenGates,
} from "@/lib/users";
import { getActivationById, getRequiredAction } from "@camp404/db/activations";
import { loadQuestionnaireResponse } from "@camp404/db/questionnaire-responses";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { nextGate } from "@/lib/required-actions";
import {
  BlockingNotice,
  RunnerHeader,
} from "@/components/questionnaire/blocking-chrome";
import { QuestionnaireFill } from "@/components/questionnaire/fill";
import { RunnerEdgeCard } from "./edge-states";
import { RunnerFrame } from "./runner-frame";

// Reads the sign-in session + the activation on every request.
export const dynamic = "force-dynamic";

export const metadata = { title: "Questionnaire — Camp 404" };

// The fill page for a questionnaire dispatched via an activation, laid out like
// AfrikaBurn's. Unlike the bespoke onboarding gate, this is reachable by direct
// link, so it enforces its own access predicate (the viewer must be targeted)
// and re-asserts the blocking-gate spine so a deep link can't jump an earlier
// required gate.
export default async function QuestionnaireFillPage({
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
  if (!activation) return <RunnerEdgeCard kind="closed" />;

  // Access predicate: the questionnaire must have been sent to this viewer and
  // still be pending — a completed/waived/expired obligation can't answer here.
  // A member who joined the audience after the send opened is gated first, so
  // a link from a reminder or a teammate does not say "not invited".
  await syncOpenGates(campUser.id);
  const targeted = await getRequiredAction(
    campUser.id,
    activation.questionnaireKey,
  );
  if (!targeted) return <RunnerEdgeCard kind="not-invited" />;
  // Must be a PENDING obligation that belongs to THIS activation — a stale row
  // pointing at a different (e.g. older) activation for the same key can't answer
  // here (nextGate routes them to the right one).
  if (
    targeted.status === "completed" &&
    targeted.activationId === activation.id
  ) {
    return <RunnerEdgeCard kind="completed" />;
  }
  if (
    targeted.status !== "pending" ||
    targeted.activationId !== activation.id
  ) {
    return <RunnerEdgeCard kind="closed" />;
  }

  // A direct link must not bypass an EARLIER pending blocking gate.
  const gate = nextGate(await getPendingRequiredActions(campUser.id));
  if (gate && gate !== `/questionnaires/${activationId}`) redirect(gate);

  if (activation.status !== "open") return <RunnerEdgeCard kind="closed" />;

  // Render the exact version this activation pinned, so historical responses
  // stay valid against what was answered.
  const definition = await getBuilderDefinition(
    activation.questionnaireKey,
    activation.version,
  );
  if (!definition) return <RunnerEdgeCard kind="unavailable" />;
  if (flattenQuestions(definition).length === 0) {
    return <RunnerEdgeCard kind="empty" />;
  }

  // The activation's FROZEN year namespace, never the live config: a rollover
  // landing mid-form must not change which row this page prefills from or the
  // row the save writes to. `carryOver` picks the prefill rule — carry reads the
  // newest answer at or below this cycle, fresh reads strictly this one.
  const stored = await loadQuestionnaireResponse(
    campUser.id,
    activation.questionnaireKey,
    { cycle: activation.cycle, carryOver: activation.carryOver },
  );
  const initialResponses: QuestionnaireResponses = stored?.responses ?? {};

  const fill = (
    <QuestionnaireFill
      activationId={activation.id}
      questionnaire={definition}
      initialResponses={initialResponses}
      seededFromPriorCycle={stored?.seededFromCycle != null}
      gate={activation.blocking}
      respondentSeed={campUser.id}
    />
  );

  // A blocking send is a HARD gate whose only reachable actions are filling it
  // in and signing out: bare and full-screen (RunnerFrame), the form in a card.
  // An optional send sits in the console like any other page, and can wait.
  return (
    <RunnerFrame className="max-w-xl">
      <div className="flex flex-col gap-6">
        <RunnerHeader title={activation.title} blocking={activation.blocking} />
        {activation.blocking ? (
          <>
            <Card>
              <CardContent className="pt-6">{fill}</CardContent>
            </Card>
            <BlockingNotice />
          </>
        ) : (
          fill
        )}
      </div>
    </RunnerFrame>
  );
}
