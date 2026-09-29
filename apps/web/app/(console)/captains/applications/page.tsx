import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { applicationRows } from "@/lib/applications";
import { captainPageGate } from "@/lib/captain-gate";
import { getCampManagementRoster } from "@/lib/roster";
import { listTicketsThisYear } from "@/lib/tickets";
import { ApplicationsBoard } from "./applications-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "Applications — Camp 404" };

// The year's application pipeline (#238): who said they are coming, who has a
// place, and, for captains, where each member's ticket, DDT and WAP
// stand. Team lead and up, because a lead reads everyone's "This year" status
// (campParticipations.status in MEMBER_FIELD_READERS); a lead reads nothing of
// the tickets, which the server leaves off their rows (applicationRows).
// Anyone else sees the heading and a lock, and nothing is read.

export default async function ApplicationsPage() {
  const { cleared, rank } = await captainPageGate("team_lead");
  const isCaptain = cleared && rank === "captain";

  const rows = cleared
    ? await (async () => {
        // The two reads are independent, so they run together. Only a
        // captain's page reads the tickets at all.
        const [members, tickets] = await Promise.all([
          getCampManagementRoster(),
          isCaptain ? listTicketsThisYear() : null,
        ]);
        return applicationRows(members, tickets);
      })()
    : null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Captains / Applications"
        title="Applications"
        description={
          isCaptain
            ? "Who is coming this year. Give places, and keep track of tickets, DDTs and WAPs."
            : cleared
              ? "What each member says about this year, and what the captains decided. Only captains give places and see tickets."
              : "Who is coming this year."
        }
      />

      {rows ? (
        <ApplicationsBoard rows={rows} canEdit={isCaptain} />
      ) : (
        <CaptainLock message="Applications are for captains and team leads. Your rank doesn't have clearance for this." />
      )}
    </div>
  );
}
