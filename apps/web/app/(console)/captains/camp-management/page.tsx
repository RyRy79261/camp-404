import { PageHeading } from "@camp404/ui/components/page-heading";
import { ExportCsvButton } from "@/components/export-csv-button";
import { captainPageGate } from "@/lib/captain-gate";
import { getCampManagementRoster } from "@/lib/roster";
import { isTeamLead } from "@/lib/users";
import { rosterForViewer } from "@/lib/camp-roster";
import { activeTeams, getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import { CampManagementRoster } from "./camp-management-roster";
import { MemberRoster } from "./member-roster";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp management — Camp 404" };

// Captains' camp-management roster. Every approved camp member may browse the
// roster (names, handles, country, role, teams), see who has applied — the
// owner's 2026-09-22 ruling — and open a public member card; the captain-only
// facets — join date, contact details, government ID, dues, captain notes, the
// decision reason and the approve/reject/assign actions — are withheld
// SERVER-SIDE for non-captains. Captains get the full triage surface, members a
// privacy-redacted projection (`toPublicRosterRow`, over a roster that leaves
// out declined sign-ups), so private fields never cross the wire for a member.

export default async function CampManagementPage({
  searchParams,
}: {
  // `?team=` opens the roster with that team already selected — the camp overview's
  // coverage rail links straight to a team's people. The key is checked below
  // against every team the config NAMES, archived ones included (the rail links
  // to an archived team that still has members on it, and the block under the
  // check adds that key to the filter dropdown so the select's value is one of
  // its options). A stale or invented key opens the full roster rather than an
  // empty, silently-filtered one.
  searchParams: Promise<{ team?: string }>;
}) {
  // Every approved member may browse; the captain bar only picks the full or
  // the public projection.
  const { cleared: isCaptain, campUser } = await captainPageGate("captain");

  // Fetch once; project to the captain (full) or member (public) row shape.
  // The public projection carries the applicant standing and nothing else off
  // the approval/onboarding/driver/dues facets, so the member branch literally
  // has no private data to leak.
  // The team data comes from the editable camp config (not a hardcoded const).
  // `teams` is the active-only, order-sorted list for the filter dropdown;
  // `teamLabels` is the full key→label map (incl. archived) for the profile
  // chips, so a captain's relabel shows on the chips too — not just the filter.
  // The reads are independent, so they run together.
  //
  // A non-captain who leads a team (ANY team: team-lead clearance is
  // camp-wide) also reads everyone's "This year" status, and nothing else of
  // the captain's view. The captain gate does not resolve the lead flag at a
  // captain bar, so it is read here.
  const [members, config, { team: requestedTeam }, lead] = await Promise.all([
    getCampManagementRoster({ includeEmail: isCaptain }),
    getTeamsConfig(),
    searchParams,
    isCaptain ? false : isTeamLead(campUser.id),
  ]);
  const roster = rosterForViewer(members, isCaptain, undefined, {
    thisYearForLead: lead,
  });
  const active = activeTeams(config);
  const teamLabels = teamLabelMap(config);
  // A team the config actually names — archived ones included, because the
  // Overview's coverage rail links to an archived team that still has members
  // on it. Anything else (a stale bookmark, a made-up key) opens the full
  // roster rather than one filtered to nothing.
  const initialTeam =
    requestedTeam && config.teams.some((t) => t.key === requestedTeam)
      ? requestedTeam
      : null;
  // The filter dropdown offers the active teams, plus the archived one the URL
  // arrived on — a select whose value is not one of its options shows blank
  // while the list below it is filtered.
  const teams =
    initialTeam && !active.some((t) => t.key === initialTeam)
      ? [
          ...active,
          {
            key: initialTeam,
            label: teamLabels[initialTeam] ?? initialTeam,
            order: active.length,
            archived: true,
          },
        ]
      : active;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow={isCaptain ? "Captains / Roster" : "Camp / Roster"}
        title="Camp management"
        description={
          isCaptain
            ? "The full roster. Open a member to read their profile, approve or reject pending sign-ups, and — captain to captain — assign captain rank."
            : "Browse who's at camp and who's applied to join — names, teams, and what folks are bringing. Contact details and the captains' decisions stay captain-only."
        }
        actions={
          // One export for every rank; the file holds only what this viewer
          // may read (lib/member-export.ts).
          <ExportCsvButton href="/captains/camp-management/export" />
        }
      />

      {roster.isCaptain ? (
        <CampManagementRoster
          rows={roster.rows}
          teams={teams}
          teamLabels={teamLabels}
          initialTeam={initialTeam}
        />
      ) : (
        <MemberRoster
          rows={roster.rows}
          teams={teams}
          teamLabels={teamLabels}
          initialTeam={initialTeam}
        />
      )}
    </div>
  );
}
