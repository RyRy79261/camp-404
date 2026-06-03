import { notFound, redirect } from "next/navigation";
import type { QuestionnaireResponses } from "@camp404/types";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  hasCampAccess,
  isApproved,
} from "@/lib/users";
import { getReplayableForm, listFormEdits } from "@/lib/forms";
import { FormReplay } from "./form-replay";
import { ChangeLog } from "./change-log";

// Reads the Neon Auth session on every request.
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function FormReplayPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  // Gate parity with the rest of the app — onboarding must be done first.
  const onboarding = await getBurnerProfile(campUser.id);
  if (!onboarding?.completedAt) {
    redirect("/onboarding/questionnaire");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }

  const form = getReplayableForm(key);
  if (!form) notFound();

  const state = await form.load(campUser.id);
  // Only a completed form is replayable; otherwise send them to the list.
  if (!state?.completedAt) {
    redirect("/tools/forms");
  }

  const edits = await listFormEdits(campUser.id, form.key);
  const lastEdited = state.updatedAt ?? state.completedAt;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <GhostBack href="/tools/forms" className="-ml-2">
        My forms
      </GhostBack>

      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold">{form.title}</h1>
          <p className="text-sm text-muted-foreground">
            Step back through the form and update anything that&apos;s changed.
            Last edited {dateFmt.format(new Date(lastEdited))}.
          </p>
        </div>

        <FormReplay
          formKey={form.key}
          questionnaire={form.questionnaire}
          initialResponses={state.responses as QuestionnaireResponses}
        />

        <ChangeLog edits={edits} />
      </div>
    </main>
  );
}
