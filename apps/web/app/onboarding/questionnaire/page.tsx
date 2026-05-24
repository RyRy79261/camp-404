import { redirect } from "next/navigation";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, getBurnerProfile, hasCampAccess } from "@/lib/users";
import { QUESTIONNAIRE } from "@/lib/questionnaire";
import { QuestionnaireWizard } from "@/components/questionnaire/wizard";
import { saveBurnerProfile } from "./actions";
import type { QuestionnaireResponses } from "@camp404/types";

// Reads the Neon Auth session on every request.
export const dynamic = "force-dynamic";

export default async function QuestionnairePage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  const profile = await getBurnerProfile(campUser.id);

  if (profile?.completedAt) {
    redirect("/");
  }

  const initialResponses: QuestionnaireResponses =
    (profile?.responses as QuestionnaireResponses | undefined) ?? {};

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Build your burner profile</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          A few questions so the camp knows who's arriving in the dust. Takes
          about two minutes.
        </p>
      </header>
      <QuestionnaireWizard
        questionnaire={QUESTIONNAIRE}
        initialResponses={initialResponses}
        action={saveBurnerProfile}
      />
    </main>
  );
}
