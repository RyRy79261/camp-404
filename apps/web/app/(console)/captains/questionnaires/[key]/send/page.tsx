import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { getOpenActivationForKey } from "@camp404/db/questionnaire-lifecycle";
import { Alert } from "@camp404/ui/components/alert";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { getLeadTeams } from "@/lib/users";
import {
  audienceLabel,
  getTeamsConfig,
  memberTeamsLabel,
  teamLabelMap,
  teamPickerOptions,
} from "@/lib/camp-config";
import { getCampManagementRoster } from "@/lib/roster";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { SendForm, type AudienceOption, type MemberOption } from "./send-form";

// The scopes this screen offers a captain, in picker order. `drivers` is
// broadcast-only and `opt_in` has no send path yet, so neither is listed — but
// both are named by the shared vocabulary, which is what keeps this list a
// CHOICE rather than an accident. A team lead is offered `team` alone.
const SEND_SCOPES = ["everyone", "team", "team_leads", "individual"] as const;
const LEAD_SCOPES = ["team"] as const;

export const dynamic = "force-dynamic";

export const metadata = { title: "Send questionnaire — Camp 404" };

// The Send/Activate screen (§6.4), laid out like the AfrikaBurn console's
// activate page. Captains send to any audience; a team lead
// sends to the teams they lead. Anyone else gets the locked shell before any
// questionnaire read. Only a published questionnaire can be sent.
export default async function SendPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { cleared, rank, campUser } = await captainPageGate("team_lead");
  const isCaptain = rank === "captain";
  // The AfrikaBurn console's send screen: the heading, then the Audience and
  // Delivery cards. The form's Cancel is the way back (to the editor for a
  // captain, the hub for a lead, who edits only their own questionnaires).
  const chrome = (children: ReactNode, description?: string) => (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Questionnaires / Send"
        title="Send to members"
        description={description}
      />
      {children}
    </div>
  );

  // A lead sends only to a team they lead this year (owner's call, 2026-09-16).
  // sendAction checks the same rule again (canSendToAudience).
  const leadTeams =
    cleared && !isCaptain ? await getLeadTeams(campUser.id) : [];
  if (!cleared || (!isCaptain && leadTeams.length === 0)) {
    return chrome(
      <CaptainLock
        title="Team leads and captains only"
        message="Only captains and team leads can send questionnaires to members."
      />,
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
    // Members are picked only for an `individual` send, which a lead can't make.
    isCaptain ? getCampManagementRoster() : Promise.resolve([]),
    getTeamsConfig(),
  ]);

  // Both pickers and the member subtitles come from the camp config through the
  // one audience vocabulary — teamPickerOptions drops ARCHIVED teams, and
  // memberTeamsLabel renders "Kitchen" where the raw `power_and_lighting` used
  // to print, ten lines from where the pretty string lives.
  const teamOptions: AudienceOption[] = teamPickerOptions(config).filter(
    (option) => isCaptain || leadTeams.includes(option.value),
  );
  const scopeOptions: AudienceOption[] = (
    isCaptain ? SEND_SCOPES : LEAD_SCOPES
  ).map((scope) => ({
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
    <div className="w-full max-w-3xl">
      <SendForm
        questionnaireKey={key}
        title={definition.title ?? ""}
        members={members}
        scopeOptions={scopeOptions}
        teamOptions={teamOptions}
        openActivationId={openActivation?.id ?? null}
        asLead={!isCaptain}
      />
    </div>,
    `Choose who answers “${definition.title}”, and whether it holds the app until they do.`,
  );
}
