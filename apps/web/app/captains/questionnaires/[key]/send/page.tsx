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
import { getCampManagementRoster } from "@/lib/roster";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { SendForm, type MemberOption } from "./send-form";

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

  const [openActivation, roster] = await Promise.all([
    getOpenActivationForKey(key),
    getCampManagementRoster(),
  ]);
  const members: MemberOption[] = roster.map((m) => ({
    id: m.id,
    label: m.displayName ?? (m.handle ? `@${m.handle}` : "Unnamed member"),
    sub: m.teams.join(", "),
  }));

  return chrome(
    <SendForm
      questionnaireKey={key}
      title={definition.title}
      members={members}
      openActivationId={openActivation?.id ?? null}
    />,
  );
}
