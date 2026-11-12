import { Sparkles } from "lucide-react";
import { getShiftsView } from "@/lib/shifts";
import { sanitationGlance } from "@/lib/team-glance/sanitation";
import { TeamGlanceCard } from "./team-glance-card";
import type { TeamPanelProps } from "./team-panels";

// Sanitation and MOOP's own panel on its program: the Shifts page's own view
// of the roster, read as this viewer (so what it may see is decided where it
// always is), turned into the cleaning roster's counts.

export async function SanitationProgramPanel({
  viewerId,
  rank,
  leadTeams,
  now,
}: TeamPanelProps) {
  const view = await getShiftsView({
    userId: viewerId,
    rank,
    ledTeams: leadTeams,
    now,
  });
  return (
    <TeamGlanceCard
      id="sanitation_and_water"
      icon={Sparkles}
      glance={sanitationGlance({ now, view })}
    />
  );
}
