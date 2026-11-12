import { Car } from "lucide-react";
import { canEditTransport } from "@camp404/core";
import { getAttendanceView, listLogisticsPhases } from "@/lib/logistics";
import { ledgerCycle } from "@/lib/payments";
import { transportGlance } from "@/lib/team-glance/transport";
import { getTransportBoard, listLiftRequests } from "@/lib/transport";
import { TeamGlanceCard } from "./team-glance-card";
import type { TeamPanelProps } from "./team-panels";

// Transport and Logistics' own panel, "Getting there": the Transport page's
// board and lift requests, and the Logistics page's days and attendance view,
// through the same reads (the test store under E2E). The lift requests are
// counted only for a Transport editor, who reads them all on Transport.

export async function TransportProgramPanel({
  rank,
  leadTeams,
  viewerId,
  now,
}: TeamPanelProps) {
  const canEdit = canEditTransport(rank, leadTeams);
  const [board, requests, phases, year] = await Promise.all([
    getTransportBoard(),
    canEdit ? listLiftRequests() : Promise.resolve(null),
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
      id="transport"
      icon={Car}
      glance={transportGlance({
        cars: board.cars,
        trailers: board.trailers,
        openRequests: requests === null ? null : requests.length,
        phases,
        attendance,
        now,
      })}
    />
  );
}
