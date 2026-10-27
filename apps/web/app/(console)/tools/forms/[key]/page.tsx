import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import type { QuestionnaireResponses } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { requireMemberPage } from "@/lib/member-gate";
import {
  ATTENDANCE_FORM_KEY,
  getReplayableForm,
  listFormEdits,
} from "@/lib/forms";
import { getPledgeStep } from "@/lib/pledge-step";
import { PledgeStep } from "@/components/dues/pledge-step";
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

  const [edits, pledgeStep] = await Promise.all([
    listFormEdits(campUser.id, form.key),
    // "Coming this year?" answered Coming: "What can you commit?" under it
    // (camp fees sprint, mock-up step 3). Saving the answer refreshes the
    // page, so a change to Coming brings the step in.
    form.key === ATTENDANCE_FORM_KEY ? getPledgeStep(campUser.id) : null,
  ]);
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

      <div className="grid gap-6 page-lg:grid-cols-3">
        <Card className="page-lg:col-span-2">
          <CardContent className="flex flex-col p-6">
            <FormReplay
              formKey={form.key}
              questionnaire={form.questionnaire}
              initialResponses={state.responses as QuestionnaireResponses}
            />
          </CardContent>
        </Card>
        {pledgeStep && (
          <section
            aria-label="Your pledge"
            className="flex flex-col page-lg:col-span-2 page-lg:col-start-1"
          >
            <PledgeStep
              scale={pledgeStep.scale}
              burnYear={pledgeStep.burnYear}
              pledge={pledgeStep.pledge}
              knownPayBy={pledgeStep.knownPayBy}
              amountLocked={pledgeStep.amountLocked}
              submitLabel={pledgeStep.pledge ? "Save my pledge" : "Send"}
            />
          </section>
        )}

        <ChangeLog edits={edits} />
      </div>
    </div>
  );
}
