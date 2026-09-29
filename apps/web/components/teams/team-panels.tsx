import type { ReactNode } from "react";
import type { Team, ViewerRank } from "@camp404/types";
import { PowerProgramPanel } from "./power-program-panel";

// Each team's own panels on its program (docs/specs/2026-09-27-team-programs.md,
// "The shape"): a map in code, by team key, not a configurable engine. A team
// with no entry shows the shared cards only, until its lead says what it needs
// (owner's ruling 5, 2026-09-27). A panel reads its own data on the server and
// decides its own edit controls from who is looking; every action behind them
// runs its own gate. The page awaits a panel as a function, so the program
// arrives in one render (no Suspense around part of a console page).

export interface TeamPanelProps {
  rank: ViewerRank;
  /** The teams the viewer leads this year (empty for a captain or member). */
  leadTeams: readonly string[];
}

export const TEAM_PANELS: Readonly<
  Partial<Record<Team, (props: TeamPanelProps) => Promise<ReactNode>>>
> = {
  power_and_lighting: PowerProgramPanel,
};
