import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { deriveViewerRank } from "@camp404/core";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { getOpenActivationForKey } from "@camp404/db/questionnaire-lifecycle";
import { Alert } from "@camp404/ui/components/alert";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import {
  audienceLabel,
  getTeamsConfig,
  memberTeamsLabel,
  teamLabelMap,
  teamPickerOptions,
} from "@/lib/camp-config";
import { getCampManagementRoster } from "@/lib/roster";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import {
  SendForm,
  type AudienceOption,
  type MemberOption,
} from "./send-form";

// The scopes this screen offers, in picker order. `drivers` is broadcast-only
// and `opt_in` has no send path yet, so neither is listed — but both are named
// by the shared vocabulary, which is what keeps this list a CHOICE rather than
// an accident.
const SEND_SCOPES = ["everyone", "team", "team_leads", "individual"] as const;

export const dynamic = "force-dynamic";

// The Send/Activate screen (§6.4). Captain-only: a non-captain gets the locked
// shell BEFORE any database read (rank is derived without the isTeamLead DB
// call — irrelevant here since this is captain-gated — so the gate is reachable
// under E2E_TEST_MODE). Only a published questionnaire can be sent.
export default async function SendPage({
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
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }

  const chrome = (children: ReactNode) => (
    <main className="mx-auto max-w-lg px-4 py-6">
      <GhostBack
        href={`/captains/questionnaires/${key}`}
        className="-ml-2 mb-4"
      >
        Editor
      </GhostBack>
      <h1 className="mb-4 text-2xl font-bold">Send to members</h1>
      {children}
    </main>
  );

  const rank = deriveViewerRank(campUser.rank, false);
  if (rank !== "captain") {
    return chrome(
      <CaptainLock message="Only captains can send questionnaires to members." />,
    );
  }

  const meta = await getDefinitionMetaRow(key);
  if (!meta) notFound();
  if (meta.status !== "published") {
    return chrome(
      <Alert variant="info">
        <span>
          Publish this questionnaire before you can send it.{" "}
          <Link
            href={`/captains/questionnaires/${key}`}
            className="font-medium underline"
          >
            Back to the editor
          </Link>
        </span>
      </Alert>,
    );
  }

  const definition = await getBuilderDefinition(key);
  if (!definition) notFound();

  const [openActivation, roster, config] = await Promise.all([
    getOpenActivationForKey(key),
    getCampManagementRoster(),
    getTeamsConfig(),
  ]);

  // Both pickers and the member subtitles come from the camp config through the
  // one audience vocabulary — teamPickerOptions drops ARCHIVED teams, and
  // memberTeamsLabel renders "Kitchen" where the raw `power_and_lighting` used
  // to print, ten lines from where the pretty string lives.
  const teamOptions: AudienceOption[] = teamPickerOptions(config);
  const scopeOptions: AudienceOption[] = SEND_SCOPES.map((scope) => ({
    value: scope,
    label: audienceLabel(scope),
  }));

  const labels = teamLabelMap(config);
  const members: MemberOption[] = roster.map((m) => ({
    id: m.id,
    label: m.displayName ?? (m.handle ? `@${m.handle}` : "Unnamed member"),
    sub: memberTeamsLabel(m.teams, labels),
  }));

  return chrome(
    <SendForm
      questionnaireKey={key}
      title={definition.title}
      members={members}
      scopeOptions={scopeOptions}
      teamOptions={teamOptions}
      openActivationId={openActivation?.id ?? null}
    />,
  );
}
