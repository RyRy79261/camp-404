import Link from "next/link";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { captainPageGate } from "@/lib/captain-gate";
import {
  listDefinitionsForViewer,
  listOpenSendBlocking,
} from "@/lib/questionnaire-definitions";
import { QuestionnaireHub, type HubItem } from "./questionnaire-hub";

export const dynamic = "force-dynamic";

export const metadata = { title: "Questionnaires — Camp 404" };

// The questionnaire-builder hub (board 49). Authoring is team-lead+ (preview-but-
// locked for everyone below); only captains publish/send (Phase D). Data is
// withheld server-side when the viewer can't author. Team-leads see published
// questionnaires + their own drafts; captains see everything (reserved code keys
// excluded by the facade either way).
const EDITED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});

export default async function QuestionnairesPage() {
  const {
    campUser,
    rank,
    cleared: canAuthor,
  } = await captainPageGate("team_lead");

  const [definitions, openSends] = canAuthor
    ? await Promise.all([
        listDefinitionsForViewer({ userId: campUser.id, rank }),
        listOpenSendBlocking(),
      ])
    : [[], new Map<string, boolean>()];
  const items: HubItem[] = canAuthor
    ? definitions.map((d) => ({
        key: d.key,
        title: d.title,
        status: d.status,
        questionCount: d.questionCount,
        editedLabel: EDITED.format(d.updatedAt),
        canDelete: d.status === "draft",
        openSendBlocking: openSends.get(d.key) ?? null,
      }))
    : [];

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      {rank !== "camp_member" ? (
        <GhostBack linkAs={Link} href="/captains/tools" className="-ml-2 mb-4">
          Camp tools
        </GhostBack>
      ) : (
        <GhostBack linkAs={Link} href="/" className="-ml-2 mb-4">
          Home
        </GhostBack>
      )}
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Questionnaires</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build and manage the custom questionnaires your camp uses to collect
          answers from members.
        </p>
      </header>

      {canAuthor ? (
        <QuestionnaireHub items={items} />
      ) : (
        <CaptainLock
          title="Team leads and captains only"
          message="The questionnaire builder is for team leads and captains. Your rank doesn't have clearance for this."
        />
      )}
    </main>
  );
}
