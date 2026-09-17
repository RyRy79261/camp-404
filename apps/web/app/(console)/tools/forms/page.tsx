import Link from "next/link";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { GhostBack } from "@camp404/ui/components/ghost-back";
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
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <GhostBack linkAs={Link} href="/tools" className="-ml-2">
        Tools
      </GhostBack>

      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold">My forms</h1>
          <p className="text-sm text-muted-foreground">
            Questionnaires you&apos;ve completed. Your burner profile can be
            updated any time, and we keep a log of what you change. Other
            questionnaires open read-only: their answers are fixed once you
            submit.
          </p>
        </div>

        {forms.length === 0 && answered.length === 0 ? (
          <EmptyState
            title="No forms yet"
            description="You haven't completed any forms yet."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {forms.map((form) => (
              <FormCard
                key={form.key}
                href={`/tools/forms/${form.key}`}
                title={form.title}
                description={form.description}
                lastEdited={dateFmt.format(
                  new Date(form.updatedAt ?? form.completedAt),
                )}
              />
            ))}
            {answered.map((a) => {
              const year = yearName(a.cycle);
              return (
                <FormCard
                  key={`${a.definitionKey}:${a.cycle}`}
                  href={`/tools/forms/answers/${encodeURIComponent(a.definitionKey)}/${a.cycle}`}
                  title={a.questionnaire.title}
                  description={
                    year ? `Your answers for ${year}.` : "Your answers."
                  }
                  lastEdited={dateFmt.format(a.updatedAt)}
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
