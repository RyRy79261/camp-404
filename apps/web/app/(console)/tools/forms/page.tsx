import Link from "next/link";
import { Check } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { requireMemberPage } from "@/lib/member-gate";
import { getCycles } from "@/lib/camp-config";
import { getMyDietary } from "@/lib/dietary";
import {
  getJustAnswered,
  listAnsweredQuestionnaires,
  listCompletedForms,
  listOptionalForms,
} from "@/lib/forms";
import { DIETARY_FORM_PATH } from "@/lib/recipe-copy";
import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { FormCard } from "./form-card";

// Reads the sign-in session on every request.
export const dynamic = "force-dynamic";

export const metadata = { title: "My forms — Camp 404" };

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CAMP_TIME_ZONE,
});

// Every form this member can fill in or has finished, as a grid of cards in
// sections (the AfrikaBurn directory's layout): optional questionnaires nobody
// has to answer (#313, drawn only when one is open), the ones they can keep
// updating, then the questionnaires whose answers are fixed. Dietary needs
// (#245) is always in "Update any time": every member can fill it in and
// change it. After an optional questionnaire is submitted, the runner comes
// back here with `?answered=<activation id>` and a strip thanks them.
export default async function FormsListPage({
  searchParams,
}: {
  searchParams: Promise<{ answered?: string }>;
}) {
  const { campUser } = await requireMemberPage();
  const { answered: answeredId } = await searchParams;

  const [forms, answered, cycles, dietary, optional, justAnswered] =
    await Promise.all([
      listCompletedForms(campUser.id),
      listAnsweredQuestionnaires(campUser.id),
      getCycles(),
      getMyDietary(campUser.id),
      listOptionalForms(campUser.id),
      getJustAnswered(campUser.id, answeredId),
    ]);
  const yearName = (cycle: number) => {
    if (cycle === UNSET_CYCLE) return null;
    const name = cycles.find((c) => c.year === cycle)?.name;
    return name ? `${cycle} (${name})` : String(cycle);
  };

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Tools / My forms"
        title="My forms"
        description="Questionnaires you can fill in, and the ones you've completed."
      />

      {justAnswered && (
        <div
          role="status"
          className="mb-6 flex flex-col gap-2 border border-success/50 bg-success/10 px-4 py-3 text-sm page-sm:flex-row page-sm:items-center page-sm:justify-between"
        >
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
            Thanks. Your answers to {justAnswered.title} are saved.
          </span>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={justAnswered.answersHref}>View my answers</Link>
          </Button>
        </div>
      )}

      {
        <div className="flex flex-col gap-8">
          {optional.length > 0 && (
            <section
              aria-labelledby="forms-optional"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-0.5">
                <h2
                  id="forms-optional"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Optional
                </h2>
                <p className="text-sm text-muted-foreground">
                  Nobody has to fill these in. Answer if you want to.
                </p>
              </div>
              <ul className="grid gap-4 page-sm:grid-cols-2 page-lg:grid-cols-3">
                {optional.map((form) => (
                  <li key={form.activationId}>
                    <FormCard
                      href={`/questionnaires/${form.activationId}`}
                      title={form.title}
                      description={form.description}
                      lastEdited={null}
                      kind="optional"
                      started={form.started}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {
            <section
              aria-labelledby="forms-editable"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-0.5">
                <h2
                  id="forms-editable"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Update any time
                </h2>
                <p className="text-sm text-muted-foreground">
                  Change your answers whenever something changes. Each save is
                  logged.
                </p>
              </div>
              <ul className="grid gap-4 page-sm:grid-cols-2 page-lg:grid-cols-3">
                {forms.map((form) => (
                  <li key={form.key}>
                    <FormCard
                      href={`/tools/forms/${form.key}`}
                      title={form.title}
                      description={form.description}
                      lastEdited={dateFmt.format(
                        new Date(form.updatedAt ?? form.completedAt),
                      )}
                      kind="editable"
                    />
                  </li>
                ))}
                <li>
                  <FormCard
                    href={DIETARY_FORM_PATH}
                    title="Dietary needs"
                    description="The foods you react to and how, and your diet. The kitchen checks the menu against them."
                    lastEdited={
                      dietary.savedAt ? dateFmt.format(dietary.savedAt) : null
                    }
                    kind="editable"
                  />
                </li>
              </ul>
            </section>
          }

          {answered.length > 0 && (
            <section
              aria-labelledby="forms-submitted"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-0.5">
                <h2
                  id="forms-submitted"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Submitted questionnaires
                </h2>
                <p className="text-sm text-muted-foreground">
                  Answers are fixed once you submit. Open one to read what you
                  said.
                </p>
              </div>
              <ul className="grid gap-4 page-sm:grid-cols-2 page-lg:grid-cols-3">
                {answered.map((a) => {
                  const year = yearName(a.cycle);
                  return (
                    <li key={`${a.definitionKey}:${a.cycle}`}>
                      <FormCard
                        href={`/tools/forms/answers/${encodeURIComponent(a.definitionKey)}/${a.cycle}`}
                        title={a.questionnaire.title ?? ""}
                        description={
                          year ? `Your answers for ${year}.` : "Your answers."
                        }
                        lastEdited={dateFmt.format(a.updatedAt)}
                        kind="submitted"
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      }
    </div>
  );
}
