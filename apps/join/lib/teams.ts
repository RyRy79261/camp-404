import type { JoinTeam } from "./join-data";

// How a camp team shows in TEAMS/: a file name (what `ls teams` prints) and a
// pixel icon (@camp404/os/pixel-icons, shared with the console). The team list
// itself is the camp's (Camp settings); these only dress it. A team added later
// gets a file from its name and the generic icon.

const FILES: Readonly<Record<string, string>> = {
  communications_and_hr: "COMMS_HR.TXT",
  finance: "FINANCE.XLS",
  structures: "STRUCTURES.DWG",
  health_and_safety: "SAFETY.SYS",
  kitchen: "KITCHEN.EXE",
  water: "WATER.H2O",
  sanitation_and_water: "SANITATION.BAT",
  ministry_of_vibes: "VIBES.CFG",
  ministry_of_memes: "MEMES.GIF",
  power_and_lighting: "POWER.DRV",
  sound: "SOUND.WAV",
  art_and_activities: "ART.BMP",
  mutant_vehicle: "MUTANT.VEH",
  transport_and_logistics: "TRANSPORT.LOG",
};

export function teamFile(team: Pick<JoinTeam, "key" | "label">): string {
  const known = FILES[team.key];
  if (known) return known;
  const stem =
    team.label
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 12) || "TEAM";
  return `${stem}.TXT`;
}
