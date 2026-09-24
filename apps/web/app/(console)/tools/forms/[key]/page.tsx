import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import type { QuestionnaireResponses } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { requireMemberPage } from "@/lib/member-gate";
import { getReplayableForm, listFormEdits } from "@/lib/forms";
import { FormReplay } from "./form-replay";
import { ChangeLog } from "./change-log";

// Reads the sign-in session on every request.
export const dynamic = "force-dynamic";

export const metadata = { title: "Update your answers — Camp 404" };

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CAMP_TIME_ZONE,
});

// Replaying a completed form, laid out like an AfrikaBurn console detail page:
// one small link back to the list above the heading, the form in the main
// column and its change log beside it.
export default async function FormReplayPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  const { campUser } = await requireMemberPage();

  const form = await getReplayableForm(key);
  if (!form) notFound();

  const state = await form.load(campUser.id);
  // Only a completed form is replayable; otherwise send them to the list.
  if (!state?.completedAt) {
    redirect("/tools/forms");
  }

  const edits = await listFormEdits(campUser.id, form.key);
  const lastEdited = state.updatedAt ?? state.completedAt;

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/tools/forms">
            <ArrowLeft aria-hidden />
            My forms
          </Link>
        </Button>
      </div>

      <div className="[overflow-wrap:anywhere]">
        <PageHeading
          eyebrow="Tools / My forms"
          title={form.title}
          description={`Step back through the form and update anything that's changed. Last edited ${dateFmt.format(new Date(lastEdited))}.`}
        />
        {/* What a change would cost, said before it is made (a member who
            holds a place, answering Coming this year?). */}
        {state.notice && (
          <p className="-mt-3 mb-6 max-w-2xl text-sm text-muted-foreground">
            {state.notice}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-col p-6">
            <FormReplay
              formKey={form.key}
              questionnaire={form.questionnaire}
              initialResponses={state.responses as QuestionnaireResponses}
            />
          </CardContent>
        </Card>

        <ChangeLog edits={edits} />
      </div>
    </div>
  );
}
