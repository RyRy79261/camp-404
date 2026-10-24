import {
  CAMP_TIME_ZONE,
  canEditBuilderDefinition,
  canReadQuestionnaireResults,
} from "@camp404/core";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { programPage } from "@/lib/program-page";
import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { getCurrentCycle } from "@/lib/camp-config";
import {
  listDefinitionsForViewer,
  listMyQuestionnaireStanding,
  listOpenSendBlocking,
} from "@/lib/questionnaire-definitions";
import {
  QuestionnaireHub,
  type HubHeading,
  type HubItem,
} from "./questionnaire-hub";

export const dynamic = "force-dynamic";

export const metadata = { title: "Questionnaires — Camp 404" };

// Every questionnaire in camp, for every member (owner, 2026-10-23:
// "questionnaires, their states, and their draft states should be essentially
// viewable by everyone in the camp"). Each row says where it stands and what
// this member may do with it: answer it, look at it, see its results (once
// they have answered), and, for team leads and captains, make, edit and send.
// Every action and page checks its own gate again on the server.
const EDITED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});

const HEADING: HubHeading = {
  eyebrow: "Questionnaires",
  title: "Questionnaires",
  description:
    "Every questionnaire in camp. Team leads and captains make and send them; everyone can look, and everyone who answers sees the results.",
};

export default async function QuestionnairesPage() {
  const { campUser, rank, cleared } = await programPage("questionnaires");
  if (!cleared) {
    return (
      <div className="flex flex-col">
        <PageHeading {...HEADING} />
        <CaptainLock
          title="Camp members only"
          message="Questionnaires are for camp members."
        />
      </div>
    );
  }

  const isCaptain = rank === "captain";
  const canAuthor = rank === "team_lead" || isCaptain;
  const year = await getCurrentCycle();
  const [definitions, openSends, standing] = await Promise.all([
    listDefinitionsForViewer({ userId: campUser.id, rank }),
    listOpenSendBlocking(),
    // Before a captain names the founding year, answers are filed under the
    // sentinel year, as every write files them (currentCycleNumber).
    listMyQuestionnaireStanding(campUser.id, year?.year ?? UNSET_CYCLE),
  ]);
  const answered = new Set(standing.answeredKeys);
  const waiting = new Map(
    standing.waiting.map((w) => [w.questionnaireKey, w.activationId]),
  );

  const items: HubItem[] = definitions.map((d) => {
    const canEdit = canEditBuilderDefinition({ rank, userId: campUser.id }, d);
    const mayReadResults = canReadQuestionnaireResults({
      rank,
      isAuthor: d.createdBy === campUser.id,
      answered: answered.has(d.key),
    });
    const waitingOn = waiting.get(d.key);
    return {
      key: d.key,
      title: d.title,
      status: d.status,
      questionCount: d.questionCount,
      editedLabel: EDITED.format(d.updatedAt),
      // The builder and the results pages gate these again on the server;
      // the list only stops offering a link that would open a lock.
      canEdit,
      canDelete: d.status === "draft" && canEdit,
      canSend: canAuthor && (d.status === "published" || canEdit),
      canDuplicate: canAuthor,
      resultsHref:
        d.status === "draft"
          ? null
          : isCaptain
            ? `/captains/questionnaires/${d.key}/metrics`
            : mayReadResults
              ? `/questionnaires/results/${d.key}`
              : null,
      answerHref: waitingOn ? `/questionnaires/${waitingOn}` : null,
      answered: answered.has(d.key),
      openSendBlocking: openSends.get(d.key) ?? null,
    };
  });

  // The list island draws the heading itself: "New questionnaire" is its
  // action, and it opens the island's own composer.
  return (
    <QuestionnaireHub
      heading={HEADING}
      items={items}
      canAuthor={canAuthor}
      canCreateAttendanceCheck={isCaptain}
    />
  );
}
