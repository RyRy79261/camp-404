import { Disc3 } from "lucide-react";
import { loungeDays } from "@camp404/core";
import { getCampSettings } from "@/lib/camp-config";
import { getLoungeProgramme, listLoungeOffers } from "@/lib/lounge";
import { offerStage } from "@/lib/lounge-view";
import { loungeGlance } from "@/lib/team-glance/lounge";
import { TeamGlanceCard } from "./team-glance-card";
import type { TeamPanelProps } from "./team-panels";

// The Ministry of Vibes' own panel on its program: the same reads the lounge
// page uses (the test store under E2E). Every offer is read only to count its
// stage; no offer and no host leaves this function.

export async function LoungeProgramPanel(_props: TeamPanelProps) {
  const camp = await getCampSettings();
  const cycle = camp.cycleNumber;
  const [programme, offers] = await Promise.all([
    getLoungeProgramme(cycle),
    listLoungeOffers(cycle),
  ]);
  const burn =
    camp.current?.burnStart && camp.current.burnEnd
      ? { start: camp.current.burnStart, end: camp.current.burnEnd }
      : null;
  const placements = new Map<string, number>();
  for (const s of programme.slots) {
    placements.set(s.offerId, (placements.get(s.offerId) ?? 0) + 1);
  }
  return (
    <TeamGlanceCard
      id="ministry_of_vibes"
      icon={Disc3}
      glance={loungeGlance({
        days: loungeDays(burn),
        programme,
        stages: offers.map((o) =>
          offerStage(o.status, placements.get(o.id) ?? 0),
        ),
      })}
    />
  );
}
