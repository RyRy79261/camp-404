import { redirect } from "next/navigation";
import { flattenBuilderQuestions } from "@camp404/types";
import type { QuestionnaireResponses } from "@camp404/types";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getPendingRequiredActions,
  hasCampAccess,
} from "@/lib/users";
import { getActivationById, getRequiredAction } from "@camp404/db/activations";
import { loadQuestionnaireResponse } from "@camp404/db/questionnaire-responses";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { nextGate } from "@/lib/required-actions";
import { BuilderRunner } from "./runner";
import { RunnerEdgeCard } from "./edge-states";

// Reads the Neon Auth session + the activation on every request.
export const dynamic = "force-dynamic";

// The generic runner for a BUILDER questionnaire dispatched via an activation.
// Unlike the bespoke onboarding gate, this is reachable by direct link, so it
// enforces its own access predicate (the viewer must be targeted) and re-asserts
// the blocking-gate spine so a deep link can't jump an earlier required gate.
export default async function QuestionnaireRunnerPage({
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
  const targeted = await getRequiredAction(campUser.id, activation.questionnaireKey);
  if (!targeted) return <RunnerEdgeCard kind="not-invited" />;
  if (targeted.status !== "pending") return <RunnerEdgeCard kind="closed" />;

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
  if (flattenBuilderQuestions(definition).length === 0) {
    return <RunnerEdgeCard kind="empty" />;
  }

  const stored = await loadQuestionnaireResponse(
    campUser.id,
    activation.questionnaireKey,
  );
  const initialResponses: QuestionnaireResponses = stored?.responses ?? {};

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8">
      <BuilderRunner
        activationId={activation.id}
        definition={definition}
        initialResponses={initialResponses}
        title={activation.title}
      />
    </main>
  );
}
