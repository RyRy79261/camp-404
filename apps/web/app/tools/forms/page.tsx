import { redirect } from "next/navigation";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  hasCampAccess,
  isApproved,
} from "@/lib/users";
import { listCompletedForms } from "@/lib/forms";
import { FormCard } from "./form-card";

// Reads the Neon Auth session on every request.
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function FormsListPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  const profile = await getBurnerProfile(campUser.id);
  if (!profile?.completedAt) {
    redirect("/onboarding/questionnaire");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }

  const forms = await listCompletedForms(campUser.id);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <GhostBack href="/tools" className="-ml-2">
        Tools
      </GhostBack>

      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold">My forms</h1>
          <p className="text-sm text-muted-foreground">
            Questionnaires you&apos;ve completed this year. Open one to review
            and update your answers — we&apos;ll keep a log of what you change.
          </p>
        </div>

        {forms.length === 0 ? (
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
          </div>
        )}
      </div>
    </main>
  );
}
