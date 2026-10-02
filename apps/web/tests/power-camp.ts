import type { CampConfig } from "@camp404/db/camp-config";
import { POWER_TEAM } from "@camp404/core";
import type { Team } from "@camp404/types";
import { testStore } from "@/lib/test-store";
import { seedPowerExample } from "@/lib/test-store-power-seed";

// The camp the Power section tests render: the test store in 2027 with a
// Power & Lighting lead (Pat Mokoena), a Kitchen lead, a plain member and a
// captain, and, unless `empty`, the approved mock-up's power plan
// (lib/test-store-power-seed.ts, the same rows the E2E screenshots use).

export interface PowerCamp {
  pat: { id: string };
  kim: { id: string };
  mem: { id: string };
  cap: { id: string };
}

function user(name: string, rank: "captain" | "member" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name.toLowerCase().replace(/\s+/g, "-")}`,
    displayName: name,
    inviteCode: "seeded",
    rank,
  });
}

function lead(name: string, team: Team) {
  const made = user(name);
  testStore.assignTeam({ userId: made.id, team });
  testStore.setLead({ userId: made.id, team, isLead: true });
  return made;
}

export function setUpPowerCamp({
  empty = false,
  withLog = false,
}: { empty?: boolean; withLog?: boolean } = {}): PowerCamp {
  testStore.reset();
  const config: CampConfig = {
    ...(testStore.getTeamsConfig() as CampConfig),
    cycles: [
      { year: 2027, startedAt: "2027-01-01T00:00:00.000Z", endedAt: null },
    ],
  };
  testStore.setTeamsConfig(config);
  const camp = {
    pat: lead("Pat Mokoena", POWER_TEAM as Team),
    kim: lead("Kim Kitchen", "kitchen"),
    mem: user("Max Member"),
    cap: user("Cara Captain", "captain"),
  };
  if (!empty) seedPowerExample(camp.pat.id, { withLog });
  return camp;
}
