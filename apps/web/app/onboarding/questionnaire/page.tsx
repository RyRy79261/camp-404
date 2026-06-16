import { redirect } from "next/navigation";
import { flattenQuestions } from "@camp404/types";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  getIdDocuments,
  hasCampAccess,
} from "@/lib/users";
import { mergeIdNumber } from "@camp404/db/id-documents";
import { getQuestionnaireForPicker } from "@/lib/questionnaire-config";
import { QuestionnaireWizard } from "@/components/questionnaire/wizard";
import { QuestionnaireGate } from "./gate";
import { saveBurnerProfile } from "./actions";
import type { QuestionnaireResponses } from "@camp404/types";

// Reads the Neon Auth session on every request.
export const dynamic = "force-dynamic";

// The burner profile is a blocking required action, so this route is the S23/S24
// blocking flow: a gate interstitial first, then — on "Start" (?start=1) — the
// wizard in its runner variant (sticky Required top bar + persistent notice).
// It's only ever reached as the required flow (the gating spine redirects here
// when burner_profile is pending and away once it's complete), so the chrome is
// unconditional — no per-request required-action lookup needed.
const TITLE = "Burner profile";

export default async function QuestionnairePage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  const profile = await getBurnerProfile(campUser.id);

  if (profile?.completedAt) {
    redirect("/");
  }

  // Merge the owner's decrypted ID number back into the pre-fill so the field
  // shows their existing value — it lives encrypted on `users`, not in
  // `responses`. Owner-only path: this page always serves the signed-in user.
  const id = (await getIdDocuments(campUser.id)) ?? {
    idType: null,
    idNumber: null,
  };
  const initialResponses: QuestionnaireResponses = mergeIdNumber(
    (profile?.responses as Record<string, unknown> | undefined) ?? {},
    id,
  ) as QuestionnaireResponses;

  // Team sliders + the team-lead multi-select come from the live camp config
  // (active teams only) — a fresh sign-up never sees an archived team.
  const questionnaire = await getQuestionnaireForPicker();

  const { start } = await searchParams;
  const questionCount = flattenQuestions(questionnaire).length;
  const estimatedMinutes = Math.max(2, Math.round(questionCount / 8));

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8">
      {start ? (
        <QuestionnaireWizard
          questionnaire={questionnaire}
          initialResponses={initialResponses}
          action={saveBurnerProfile}
          variant="runner"
          title={TITLE}
        />
      ) : (
        <QuestionnaireGate
          title={TITLE}
          questionCount={questionCount}
          estimatedMinutes={estimatedMinutes}
          startHref="/onboarding/questionnaire?start=1"
        />
      )}
    </main>
  );
}
