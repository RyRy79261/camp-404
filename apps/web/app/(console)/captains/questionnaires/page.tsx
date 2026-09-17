import { CAMP_TIME_ZONE } from "@camp404/core";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import {
  listDefinitionsForViewer,
  listOpenSendBlocking,
} from "@/lib/questionnaire-definitions";
import {
  QuestionnaireHub,
  type HubHeading,
  type HubItem,
} from "./questionnaire-hub";

export const dynamic = "force-dynamic";

export const metadata = { title: "Questionnaires — Camp 404" };

// The questionnaire-builder hub (the AfrikaBurn console's questionnaire list).
// Authoring is team-lead+ (preview-but-locked for everyone below); only captains
// publish/send (Phase D). Data is withheld server-side when the viewer can't
// author. Team-leads see published questionnaires + their own drafts; captains
// see everything (reserved code keys excluded by the facade either way).
const EDITED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});

const HEADING: HubHeading = {
  eyebrow: "Captains / Questionnaires",
  title: "Questionnaires",
  description:
    "Build and manage the custom questionnaires your camp uses to collect answers from members.",
};

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
        // The builder and the results page gate these again on the server;
        // the hub only stops offering a link that would open a lock.
        canEdit: rank === "captain" || d.createdBy === campUser.id,
        canDelete: d.status === "draft",
        canSeeResults: rank === "captain",
        openSendBlocking: openSends.get(d.key) ?? null,
      }))
    : [];

  // The hub island draws the heading itself: "New questionnaire" is its action,
  // and it opens the island's own composer.
  return canAuthor ? (
    <QuestionnaireHub heading={HEADING} items={items} />
  ) : (
    <div className="flex flex-col">
      <PageHeading {...HEADING} />
      <CaptainLock
        title="Team leads and captains only"
        message="The questionnaire builder is for team leads and captains. Your rank doesn't have clearance for this."
      />
    </div>
  );
}
