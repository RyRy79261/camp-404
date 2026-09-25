import type { JoinTeam } from "./join-data";

// How a camp team shows in TEAMS/: a file name (what `ls teams` prints) and a
// pixel icon. The team list itself is the camp's (Camp settings); these only
// dress it. A team added later gets a file from its name and the generic icon.

export type TeamIcon =
  | "comms"
  | "finance"
  | "structures"
  | "safety"
  | "kitchen"
  | "water"
  | "sanitation"
  | "vibes"
  | "memes"
  | "power"
  | "sound"
  | "art"
  | "mutant"
  | "transport"
  | "generic";

const BY_KEY: Record<string, { file: string; icon: TeamIcon }> = {
  communications_and_hr: { file: "COMMS_HR.TXT", icon: "comms" },
  finance: { file: "FINANCE.XLS", icon: "finance" },
  structures: { file: "STRUCTURES.DWG", icon: "structures" },
  health_and_safety: { file: "SAFETY.SYS", icon: "safety" },
  kitchen: { file: "KITCHEN.EXE", icon: "kitchen" },
  water: { file: "WATER.H2O", icon: "water" },
  sanitation_and_water: { file: "SANITATION.BAT", icon: "sanitation" },
  ministry_of_vibes: { file: "VIBES.CFG", icon: "vibes" },
  ministry_of_memes: { file: "MEMES.GIF", icon: "memes" },
  power_and_lighting: { file: "POWER.DRV", icon: "power" },
  sound: { file: "SOUND.WAV", icon: "sound" },
  art_and_activities: { file: "ART.BMP", icon: "art" },
  mutant_vehicle: { file: "MUTANT.VEH", icon: "mutant" },
  transport_and_logistics: { file: "TRANSPORT.LOG", icon: "transport" },
};

export function teamFile(team: Pick<JoinTeam, "key" | "label">): string {
  const known = BY_KEY[team.key];
  if (known) return known.file;
  const stem =
    team.label
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 12) || "TEAM";
  return `${stem}.TXT`;
}

export function teamIcon(team: Pick<JoinTeam, "key">): TeamIcon {
  return BY_KEY[team.key]?.icon ?? "generic";
}
