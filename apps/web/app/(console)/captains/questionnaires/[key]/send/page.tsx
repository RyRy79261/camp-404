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
import { captainPageGate } from "@/lib/captain-gate";
import { getLeadTeams } from "@/lib/users";
import {
  audienceLabel,
  getCurrentCycle,
  getTeamsConfig,
  memberTeamsLabel,
  teamLabelMap,
  teamPickerOptions,
} from "@/lib/camp-config";
import { getCampManagementRoster } from "@/lib/roster";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { parseSendPrefill } from "./prefill";

// The scopes this screen offers a captain, in picker order. `drivers` is
// broadcast-only and `opt_in` has no send path yet, so neither is listed — but
// both are named by the shared vocabulary, which is what keeps this list a
// CHOICE rather than an accident. A team lead is offered `team` alone.
const SEND_SCOPES = ["everyone", "team", "team_leads", "individual"] as const;
const LEAD_SCOPES = ["team"] as const;

export const dynamic = "force-dynamic";

export const metadata = { title: "Send questionnaire — Camp 404" };

// The Send/Activate screen (§6.4), from the AfrikaBurn console's activate
// page. Captains send to any audience; a team lead sends to the teams they
// lead. Anyone else gets the locked shell before any questionnaire read. Only
// a published questionnaire can be sent.
export default async function SendPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await params;
  const { cleared, rank, campUser } = await captainPageGate("team_lead");
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

  // A lead sends only to a team they lead this year (owner's call, 2026-09-16).
  // sendAction checks the same rule again (canSendToAudience).
  const leadTeams =
    cleared && !isCaptain ? await getLeadTeams(campUser.id) : [];
  if (!cleared || (!isCaptain && leadTeams.length === 0)) {
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
      "Send to members",
    );
  }

  const definition = await getBuilderDefinition(key);
  if (!definition) notFound();

  const [openActivation, roster, config, year, query] = await Promise.all([
    getOpenActivationForKey(key),
    // Members are picked only for an `individual` send, which a lead can't make.
    isCaptain ? getCampManagementRoster() : Promise.resolve([]),
    getTeamsConfig(),
    getCurrentCycle(),
    searchParams,
  ]);

  // Both pickers and the member subtitles come from the camp config through the
  // one audience vocabulary — teamPickerOptions drops ARCHIVED teams, and
  // memberTeamsLabel renders "Kitchen" where the raw `power_and_lighting` used
  // to print.
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
        asLead={!isCaptain}
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
      />
    </div>,
    title,
    "Choose an audience and delivery options, then send.",
  );
}
