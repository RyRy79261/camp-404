import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { getOpenActivationForKey } from "@camp404/db/questionnaire-lifecycle";
import { Alert } from "@camp404/ui/components/alert";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ActivationForm,
  type AudienceChoice,
  type AudienceOption,
  type MemberOption,
} from "@/components/questionnaires/activation-form";
import { programPage } from "@/lib/program-page";
import {
  audienceLabel,
  getCurrentCycle,
  getTeamsConfig,
  memberTeamsLabel,
  teamLabelMap,
  teamPickerOptions,
} from "@/lib/camp-config";
import { getCampManagementRoster } from "@/lib/roster";
import { countOptInMembers } from "@camp404/db/activations";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { parseSendPrefill } from "./prefill";

// The audiences this screen offers for "People you choose must answer", in
// picker order. `drivers` is broadcast-only, so it is not listed. `opt_in` is
// not an audience in that list: it is the other answer to "Who answers?"
// (#313). A team lead is offered the same as a captain (owner, 2026-10-23).
const SEND_SCOPES = ["everyone", "team", "team_leads", "individual"] as const;

export const dynamic = "force-dynamic";

export const metadata = { title: "Send questionnaire — Camp 404" };

// The Send/Activate screen (§6.4), from the AfrikaBurn console's activate
// page. Team leads and captains send to any audience (owner, 2026-10-23);
// anyone else gets the locked shell before any questionnaire read. Sending
// puts the questionnaire online in the same press: its author or a captain
// may send a draft, anyone else only one already online.
export default async function SendPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await params;
  const { cleared, rank, campUser } = await programPage("send-questionnaire");
  const isCaptain = rank === "captain";
  const chrome = (children: ReactNode, title: string, description?: string) => (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Questionnaires / Send"
        title={title}
        description={description}
      />
      {children}
    </div>
  );

  // sendAction checks the same rule again (canSendQuestionnaireTo).
  if (!cleared) {
    // Nothing about the questionnaire is read for a viewer who can't send, so
    // the heading names the page, not the questionnaire.
    return chrome(
      <CaptainLock
        title="Team leads and captains only"
        message="Only captains and team leads can send questionnaires to members."
      />,
      "Send to members",
    );
  }

  const meta = await getDefinitionMetaRow(key);
  if (!meta) notFound();
  // Its author or a captain sends their latest version, which goes online in
  // the same press. Anyone else sends only what is already online.
  const canEdit = isCaptain || meta.createdBy === campUser.id;
  if (meta.status !== "published" && !canEdit) {
    return chrome(
      <Alert variant="info">
        <span>
          Only its author or a captain can send this questionnaire for the first
          time.{" "}
          <Link
            href={`/captains/questionnaires/${key}/preview`}
            className="font-medium underline"
          >
            Look at it
          </Link>
        </span>
      </Alert>,
      "Send to members",
    );
  }

  const definition = await getBuilderDefinition(key);
  if (!definition) notFound();

  const [openActivation, roster, config, year, query, campMembers] =
    await Promise.all([
      getOpenActivationForKey(key),
      // Members are picked for an `individual` send. Only names and teams
      // reach the page.
      getCampManagementRoster(),
      getTeamsConfig(),
      getCurrentCycle(),
      searchParams,
      // "For all N camp members", for the optional send.
      countOptInMembers(),
    ]);

  // Both pickers and the member subtitles come from the camp config through the
  // one audience vocabulary — teamPickerOptions drops ARCHIVED teams, and
  // memberTeamsLabel renders "Kitchen" where the raw `power_and_lighting` used
  // to print.
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

  // The editor may hand its choices over in the query string. Anything the
  // viewer may not choose simply pre-fills nothing; the send is authorised on
  // the server as always.
  const prefill = parseSendPrefill(query);
  const initialAudience: AudienceChoice | null =
    prefill.audience &&
    scopeOptions.some((o) => o.value === prefill.audience?.scope)
      ? prefill.audience
      : null;
  const title = definition.title || key;

  return chrome(
    <div className="w-full max-w-4xl">
      <ActivationForm
        questionnaireKey={key}
        title={title}
        members={members}
        scopeOptions={scopeOptions}
        teamOptions={teamOptions}
        openActivationId={openActivation?.id ?? null}
        notAuthor={!canEdit}
        yearLabel={
          year
            ? year.name
              ? `${year.year} (${year.name})`
              : String(year.year)
            : null
        }
        initialAudience={initialAudience}
        initialBlocking={prefill.blocking}
        initialDueAt={prefill.dueAt}
        offerOptIn
        campMemberCount={campMembers}
      />
    </div>,
    title,
    "Choose who answers, then send. Sending puts it online and asks them in one step.",
  );
}
