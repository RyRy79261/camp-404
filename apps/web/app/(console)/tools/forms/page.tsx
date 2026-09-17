import { ClipboardList } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { requireMemberPage } from "@/lib/member-gate";
import { getCycles } from "@/lib/camp-config";
import { listAnsweredQuestionnaires, listCompletedForms } from "@/lib/forms";
import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { FormCard } from "./form-card";

// Reads the Neon Auth session on every request.
export const dynamic = "force-dynamic";

export const metadata = { title: "My forms — Camp 404" };

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CAMP_TIME_ZONE,
});

// Every form this member has finished, as a grid of cards in two sections (the
// AfrikaBurn directory's layout): the ones they can keep updating, then the
// questionnaires whose answers are fixed.
export default async function FormsListPage() {
  const { campUser } = await requireMemberPage();

  const [forms, answered, cycles] = await Promise.all([
    listCompletedForms(campUser.id),
    listAnsweredQuestionnaires(campUser.id),
    getCycles(),
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
        description="Questionnaires you've completed. Your burner profile can be updated any time, and we keep a log of what you change. Other questionnaires open read-only: their answers are fixed once you submit."
      />

      {forms.length === 0 && answered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList aria-hidden />}
          title="No forms yet"
          description="You haven't completed any forms yet."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {forms.length > 0 && (
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
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {forms.map((form) => (
                  <li key={form.key}>
                    <FormCard
                      href={`/tools/forms/${form.key}`}
                      title={form.title}
                      description={form.description}
                      lastEdited={dateFmt.format(
                        new Date(form.updatedAt ?? form.completedAt),
                      )}
                      editable
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

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
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {answered.map((a) => {
                  const year = yearName(a.cycle);
                  return (
                    <li key={`${a.definitionKey}:${a.cycle}`}>
                      <FormCard
                        href={`/tools/forms/answers/${encodeURIComponent(a.definitionKey)}/${a.cycle}`}
                        title={a.questionnaire.title}
                        description={
                          year ? `Your answers for ${year}.` : "Your answers."
                        }
                        lastEdited={dateFmt.format(a.updatedAt)}
                        editable={false}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
