import Link from "next/link";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { ExportCsvButton } from "@/components/export-csv-button";
import { captainPageGate } from "@/lib/captain-gate";
import { getCampManagementRoster } from "@/lib/roster";
import { rosterForViewer } from "@/lib/camp-roster";
import { activeTeams, getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import { CampManagementRoster } from "./camp-management-roster";
import { MemberRoster } from "./member-roster";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp management — Camp 404" };

// Captains' camp-management roster. Every approved camp member may browse the
// roster (names, handles, country, role, teams) and open a public member card;
// the captain-only facets — approval status, join date, contact details,
// government ID, and the approve/reject/assign actions — are withheld
// SERVER-SIDE for non-captains. Captains get the full triage surface, members a
// privacy-redacted projection (`toPublicRosterRow`), so private fields never
// cross the wire for a member.

export default async function CampManagementPage() {
  // Every approved member may browse; the captain bar only picks the full or
  // the public projection.
  const { cleared: isCaptain } = await captainPageGate("captain");

  // Fetch once; project to the captain (full) or member (public) row shape.
  // The public projection carries no approval/onboarding/driver facets, so the
  // member branch literally has no private data to leak.
  // The team data comes from the editable camp config (not a hardcoded const).
  // `teams` is the active-only, order-sorted list for the filter dropdown;
  // `teamLabels` is the full key→label map (incl. archived) for the profile
  // chips, so a captain's relabel shows on the chips too — not just the filter.
  // The two reads are independent, so they run together.
  const [members, config] = await Promise.all([
    getCampManagementRoster({ includeEmail: isCaptain }),
    getTeamsConfig(),
  ]);
  const roster = rosterForViewer(members, isCaptain);
  const teams = activeTeams(config);
  const teamLabels = teamLabelMap(config);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <GhostBack linkAs={Link} href="/captains/tools" className="-ml-2 mb-3">
        Camp tools
      </GhostBack>

      <header className="mb-6 flex flex-col gap-3">
        {/* TermBar — terminal chrome, ≥ sm only. */}
        <div className="hidden items-center gap-2.5 self-start rounded-lg border bg-muted px-3.5 py-2 sm:inline-flex">
          <span className="font-mono text-caption font-medium text-muted-foreground">
            camp404 · roster
          </span>
          <span className="font-mono text-caption font-medium text-accent">
            {members.length} {members.length === 1 ? "record" : "records"}
          </span>
        </div>

        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground sm:font-mono">
          <span aria-hidden className="hidden text-accent sm:inline">
            {">"}
          </span>
          Camp management
          <span
            aria-hidden
            className="hidden h-6 w-3 motion-safe:animate-pulse bg-accent sm:inline-block"
          />
        </h1>

        <p className="hidden max-w-2xl text-sm text-muted-foreground sm:block">
          {isCaptain
            ? "The full roster. Open a member to read their profile, approve or reject pending sign-ups, and — captain to captain — assign captain rank."
            : "Browse who's at camp — names, teams, and what folks are bringing. Approval status and contact details stay captain-only."}
        </p>

        {/* One export for every rank; the file holds only what this viewer
            may read (lib/member-export.ts). */}
        <div className="self-start">
          <ExportCsvButton href="/captains/camp-management/export" />
        </div>
      </header>

      {roster.isCaptain ? (
        <CampManagementRoster
          rows={roster.rows}
          teams={teams}
          teamLabels={teamLabels}
        />
      ) : (
        <MemberRoster rows={roster.rows} teams={teams} teamLabels={teamLabels} />
      )}
    </main>
  );
}
