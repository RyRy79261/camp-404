import { Hammer } from "lucide-react";
import { canEditLayout } from "@camp404/core";
import { getCampLayout } from "@/lib/camp-layout";
import { getAttendanceView, listLogisticsPhases } from "@/lib/logistics";
import { ledgerCycle } from "@/lib/payments";
import { structuresGlance } from "@/lib/team-glance/structures";
import { TeamGlanceCard } from "./team-glance-card";
import type { TeamPanelProps } from "./team-panels";

// Structures' own panel, "The build": the Camp layout page's latest version
// and its neighbour switch, and the Logistics page's days and attendance
// view, through the same reads (the test store under E2E).

export async function StructuresProgramPanel({
  rank,
  leadTeams,
  viewerId,
  now,
}: TeamPanelProps) {
  const [layout, phases, year] = await Promise.all([
    getCampLayout(),
    listLogisticsPhases(),
    ledgerCycle(),
  ]);
  const attendance = await getAttendanceView({
    userId: viewerId,
    rank,
    cycle: year,
  });
  return (
    <TeamGlanceCard
      id="structures"
      icon={Hammer}
      glance={structuresGlance({
        layout: {
          version: layout.version,
          savedAt: layout.savedAt,
          shared: layout.shared,
        },
        phases,
        attendance,
        canEditLayout: canEditLayout(rank, leadTeams),
        now,
      })}
    />
  );
}
