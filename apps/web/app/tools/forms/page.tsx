import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, getBurnerProfile, hasCampAccess } from "@/lib/users";
import { listCompletedForms } from "@/lib/forms";

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

  const forms = await listCompletedForms(campUser.id);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8">
      <Link
        href="/tools"
        className="mb-6 inline-flex items-center gap-1 text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]"
      >
        <ChevronLeft className="h-4 w-4" />
        Tools
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">My forms</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Questionnaires you've completed this year. Open one to review and
          update your answers — we'll keep a log of what you change.
        </p>
      </header>

      {forms.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-[color:var(--color-muted-foreground)]">
          You haven't completed any forms yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {forms.map((form) => {
            const lastEdited = form.updatedAt ?? form.completedAt;
            return (
              <Link
                key={form.key}
                href={`/tools/forms/${form.key}`}
                className="block"
              >
                <Card className="transition-colors hover:border-[color:var(--color-primary)]">
                  <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                    <div className="flex flex-col gap-1.5">
                      <CardTitle className="text-lg">{form.title}</CardTitle>
                      <CardDescription>{form.description}</CardDescription>
                      <p className="text-xs text-[color:var(--color-muted-foreground)]">
                        Last edited {dateFmt.format(lastEdited)}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[color:var(--color-muted-foreground)]" />
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
