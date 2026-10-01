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
        eyebrow="Camp / Applications"
        title="Applications"
        description={
          isCaptain
            ? "Says is the member's answer. Decision, ticket, DDT and WAP are set by captains."
            : cleared
              ? "Says is the member's answer; Decision is the captains'. Only captains give places and see tickets."
              : undefined
        }
      />

      {rows ? (
        <ApplicationsBoard rows={rows} canEdit={isCaptain} />
      ) : (
        <CaptainLock
          title="For captains and team leads"
          message="Ask a captain if you need to know who is coming."
        />
      )}
    </div>
  );
}
