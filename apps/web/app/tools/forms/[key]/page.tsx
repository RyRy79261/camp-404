import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { QuestionnaireResponses } from "@camp404/types";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, getBurnerProfile, hasCampAccess } from "@/lib/users";
import { getReplayableForm, listFormEdits, type FormEdit } from "@/lib/forms";
import { FormReplay } from "./form-replay";

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
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8">
      <Link
        href="/tools/forms"
        className="mb-6 inline-flex items-center gap-1 text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]"
      >
        <ChevronLeft className="h-4 w-4" />
        My forms
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{form.title}</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Step back through the form and update anything that's changed. Last
          edited {dateFmt.format(lastEdited)}.
        </p>
      </header>

      <FormReplay
        formKey={form.key}
        questionnaire={form.questionnaire}
        initialResponses={state.responses as QuestionnaireResponses}
      />

      <ChangeLog edits={edits} />
    </main>
  );
}

function ChangeLog({ edits }: { edits: FormEdit[] }) {
  return (
    <section className="mt-10 border-t pt-6">
      <h2 className="text-lg font-semibold">Change log</h2>
      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
        Every time you update this form we record what changed. We don't keep
        old versions — just this running history.
      </p>
      {edits.length === 0 ? (
        <p className="mt-4 text-sm text-[color:var(--color-muted-foreground)]">
          No edits yet. Changes you make here will show up in this list.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-4">
          {edits.map((edit) => (
            <li
              key={edit.id}
              className="rounded-lg border bg-[color:var(--color-card)] p-4"
            >
              <p className="text-sm font-medium">
                {dateFmt.format(edit.createdAt)}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {edit.changes.map((change) => (
                  <li key={change.fieldId} className="text-sm">
                    <span className="font-medium">{change.label}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[color:var(--color-muted-foreground)]">
                      <span className="line-through">{change.from}</span>
                      <span aria-hidden>→</span>
                      <span className="text-[color:var(--color-foreground)]">
                        {change.to}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
