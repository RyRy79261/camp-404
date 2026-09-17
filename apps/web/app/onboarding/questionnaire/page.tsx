import { redirect } from "next/navigation";
import { flattenQuestions, mergeEmergencyContacts } from "@camp404/types";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  getEmergencyContacts,
  getIdDocuments,
  hasCampAccess,
  satisfyBurnerProfileAction,
} from "@/lib/users";
import { mergeIdNumber } from "@camp404/db/id-documents";
import { getQuestionnaireForPicker } from "@/lib/questionnaire-config";
import { Card, CardContent } from "@camp404/ui/components/card";
import {
  BlockingNotice,
  RunnerHeader,
} from "@/components/questionnaire/blocking-chrome";
import { QuestionnaireGate } from "./gate";
import { BurnerProfileRunner } from "./burner-profile-runner";
import type { QuestionnaireResponses } from "@camp404/types";

// Reads the Neon Auth session on every request.
export const dynamic = "force-dynamic";

export const metadata = { title: "Your burner profile — Camp 404" };

// The burner profile is a blocking required action, so this route is the
// blocking flow: a gate interstitial first, then — on "Start" (?start=1) — the
// shared runner under the blocking chrome (Required, Sign out, the lock line).
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
    // Heal the gate before sending them home. If the final submit marked the
    // profile complete but failed to satisfy the burner_profile required
    // action, home would send them straight back here, forever. Satisfying an
    // already-satisfied action is a no-op.
    await satisfyBurnerProfileAction(campUser.id);
    redirect("/");
  }

  // Merge the owner's decrypted ID number back into the pre-fill so the field
  // shows their existing value — it lives encrypted on `users`, not in
  // `responses`. Owner-only path: this page always serves the signed-in user.
  const id = (await getIdDocuments(campUser.id)) ?? {
    idType: null,
    idNumber: null,
  };
  // Team sliders + the team-lead multi-select come from the live camp config
  // (active teams only) — a fresh sign-up never sees an archived team.
  const questionnaire = await getQuestionnaireForPicker();

  // The emergency contacts live on `users` too; put them back the same way.
  const initialResponses: QuestionnaireResponses = mergeEmergencyContacts(
    questionnaire,
    mergeIdNumber(
      (profile?.responses as Record<string, unknown> | undefined) ?? {},
      id,
    ),
    await getEmergencyContacts(campUser.id),
  ) as QuestionnaireResponses;

  const { start } = await searchParams;
  const questionCount = flattenQuestions(questionnaire).length;
  const estimatedMinutes = Math.max(2, Math.round(questionCount / 8));

  if (!start) {
    return (
      <QuestionnaireGate
        title={TITLE}
        questionCount={questionCount}
        estimatedMinutes={estimatedMinutes}
        startHref="/onboarding/questionnaire?start=1"
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <RunnerHeader title={TITLE} blocking />
      <Card>
        <CardContent className="pt-6">
          <BurnerProfileRunner
            questionnaire={questionnaire}
            initialResponses={initialResponses}
          />
        </CardContent>
      </Card>
      <BlockingNotice />
    </main>
  );
}
