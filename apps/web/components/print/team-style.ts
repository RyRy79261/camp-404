import {
  CalendarDays,
  CarFront,
  Coins,
  Droplet,
  HeartPulse,
  Laugh,
  MessagesSquare,
  Music,
  Palette,
  Speaker,
  Star,
  Tent,
  Trash2,
  Truck,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Team } from "@camp404/types";

// Each team's quiet colour and small line icon on the daily site sheet
// (#249, owner 2026-10-02: easy to tell apart, "not too loud"; many members
// are autistic and the page holds a lot). The one place they are set: every
// key in the team enum has one (a test fails when a team is added without
// one), and a team the enum does not know gets the fallback. The icons differ
// in shape, so the sections still tell apart printed in black and white.
// `edge` draws the section's border and icon; `tint` its heading's ground.

export interface TeamSheetStyle {
  edge: string;
  tint: string;
  Icon: LucideIcon;
}

export const TEAM_SHEET_STYLES: Readonly<Record<Team, TeamSheetStyle>> = {
  kitchen: { edge: "#c9a227", tint: "#fbf5e0", Icon: Utensils },
  structures: { edge: "#b0526a", tint: "#f8e9ed", Icon: Tent },
  power_and_lighting: { edge: "#d0782f", tint: "#fcefe4", Icon: Zap },
  sanitation_and_water: { edge: "#5aa36e", tint: "#e9f5ec", Icon: Trash2 },
  health_and_safety: { edge: "#c25a55", tint: "#faeceb", Icon: HeartPulse },
  art_and_activities: { edge: "#c46a9e", tint: "#f9ebf3", Icon: Palette },
  ministry_of_memes: { edge: "#8f9c3f", tint: "#f2f5e3", Icon: Laugh },
  ministry_of_vibes: { edge: "#a46cc4", tint: "#f4ecf9", Icon: Music },
  finance: { edge: "#4f9a94", tint: "#e6f3f2", Icon: Coins },
  transport_and_logistics: { edge: "#7d8790", tint: "#eff1f3", Icon: Truck },
  communications_and_hr: {
    edge: "#5b7fc4",
    tint: "#ebf0fa",
    Icon: MessagesSquare,
  },
  mutant_vehicle: { edge: "#9c7a5b", tint: "#f4eee8", Icon: CarFront },
  sound: { edge: "#6c6cc4", tint: "#ededf9", Icon: Speaker },
  water: { edge: "#3f8fc9", tint: "#e8f2fa", Icon: Droplet },
};

/** A team the enum does not know yet: grey, with a star. */
export const FALLBACK_SHEET_STYLE: TeamSheetStyle = {
  edge: "#8c8c8c",
  tint: "#f3f3f3",
  Icon: Star,
};

/** Today's events: black, with a calendar. */
export const EVENTS_SHEET_STYLE: TeamSheetStyle = {
  edge: "#111111",
  tint: "#f2f2f2",
  Icon: CalendarDays,
};

/** The style for `team`, or the fallback. */
export function teamSheetStyle(team: string): TeamSheetStyle {
  return Object.hasOwn(TEAM_SHEET_STYLES, team)
    ? TEAM_SHEET_STYLES[team as Team]
    : FALLBACK_SHEET_STYLE;
}
