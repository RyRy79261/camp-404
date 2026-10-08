import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { ExportCsvButton } from "@/components/export-csv-button";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { buildCampSheet } from "@/lib/camp-sheet";
import { CampSheetGrid } from "./camp-sheet-grid";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp sheet — Camp 404" };

// The Camp sheet: every member and everything the camp holds on them, on one
// screen (the previous captain ran the camp from a spreadsheet: "I could look
// at all the members and all their info all at once"). Captain-only,
// preview-but-locked (D3): anyone else gets the heading and a lock, and no
// member's data is read for them. Opening it writes one audit row before the
// sheet is drawn (lib/camp-sheet.ts), because it shows ID numbers.

export default async function CampSheetPage() {
  const { cleared, campUser } = await captainPageGate("captain");

  if (!cleared) {
    return (
      <div className="flex flex-col">
        <PageHeading
          eyebrow="Captains / Camp sheet"
          title="Camp sheet"
          description="Everyone in the camp and everything we hold on them, on one screen."
        />
        <CaptainLock message="The camp sheet is captain-only. Your rank doesn't have clearance for this." />
      </div>
    );
  }

  const [sheet, config] = await Promise.all([
    buildCampSheet({ userId: campUser.id }),
    getTeamsConfig(),
  ]);
  const teams = activeTeams(config).map((t) => ({
    key: t.key,
    label: t.label,
  }));

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Captains / Camp sheet"
        title="Camp sheet"
        description="Everyone in the camp and everything we hold on them, on one screen. Opening this sheet is written to the audit log."
        actions={<ExportCsvButton href="/captains/camp-management/export" />}
      />
      <CampSheetGrid columns={sheet.columns} rows={sheet.rows} teams={teams} />
    </div>
  );
}
