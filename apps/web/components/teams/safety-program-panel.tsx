import { ShieldPlus } from "lucide-react";
import { SAFETY_COUNTS_READER } from "@camp404/core";
import { getSafetyCountsFor } from "@/lib/team-glance-counts";
import { safetyGlance } from "@/lib/team-glance/safety";
import { getEmergencyContacts } from "@/lib/users";
import { TeamGlanceCard } from "./team-glance-card";
import type { TeamPanelProps } from "./team-panels";

// The Safety team's own panel on its team page. The viewer split is decided
// HERE, before any read: a captain or a Safety lead (SAFETY_COUNTS_READER)
// gets the counts, which the database checks again for itself; anyone else
// reads only their OWN emergency contacts, to say "Set" or "Not set yet"
// (a member reading their own data, so no audit row, and the contact itself
// never reaches the card). The counts name nobody and open nobody's data, so
// this panel writes no audit row either.

export async function SafetyProgramPanel({ actor, viewerId }: TeamPanelProps) {
  if (SAFETY_COUNTS_READER.allows(actor)) {
    const counts = await getSafetyCountsFor(viewerId);
    if (counts) {
      return (
        <TeamGlanceCard
          id="safety"
          icon={ShieldPlus}
          glance={safetyGlance({
            view: "reader",
            counts,
            isCaptain: actor.rank === "captain",
          })}
        />
      );
    }
    // The database's own read of the viewer refused (a demotion since the
    // page's gate): fall through to their own line.
  }
  const mine = await getEmergencyContacts(viewerId);
  return (
    <TeamGlanceCard
      id="safety"
      icon={ShieldPlus}
      glance={safetyGlance({
        view: "member",
        hasEmergencyContact: (mine?.length ?? 0) > 0,
      })}
    />
  );
}
