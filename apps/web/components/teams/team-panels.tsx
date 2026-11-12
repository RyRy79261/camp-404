import type { ReactNode } from "react";
import type { Actor } from "@camp404/core";
import type { Team, ViewerRank } from "@camp404/types";
import { CommsProgramPanel } from "./comms-program-panel";
import { FinanceProgramPanel } from "./finance-program-panel";
import { KitchenProgramPanel } from "./kitchen-program-panel";
import { LoungeProgramPanel } from "./lounge-program-panel";
import { PowerProgramPanel } from "./power-program-panel";
import { SafetyProgramPanel } from "./safety-program-panel";
import { SanitationProgramPanel } from "./sanitation-program-panel";
import { StructuresProgramPanel } from "./structures-program-panel";
import { TransportProgramPanel } from "./transport-program-panel";

// Each team's own panels on its program (docs/specs/2026-09-27-team-programs.md,
// "The shape"): a map in code, by team key, not a configurable engine. A team
// with no entry shows the shared cards only, until its lead says what it needs
// (owner's ruling 5, 2026-09-27). [2026-11-12] Each panel with data of its own
// is a "glance" (lib/team-glance.ts, the owner's approved mock-up
// docs/plans/2026-11-12-team-dashboards-mockup.html): counts only, no names. A panel reads its own data on the server and
// decides its own edit controls from who is looking; every action behind them
// runs its own gate. The page awaits a panel as a function, so the program
// arrives in one render (no Suspense around part of a console page).

export interface TeamPanelProps {
  rank: ViewerRank;
  /** The teams the viewer leads this year (empty for a captain or member). */
  leadTeams: readonly string[];
  /** The viewer: a panel shows a member their own line (their fees, their
   *  emergency contact) and the team's figures to those its rule allows. */
  viewerId: string;
  actor: Actor;
  now: Date;
}

export const TEAM_PANELS: Readonly<
  Partial<Record<Team, (props: TeamPanelProps) => Promise<ReactNode>>>
> = {
  communications_and_hr: CommsProgramPanel,
  finance: FinanceProgramPanel,
  health_and_safety: SafetyProgramPanel,
  kitchen: KitchenProgramPanel,
  ministry_of_vibes: LoungeProgramPanel,
  power_and_lighting: PowerProgramPanel,
  sanitation_and_water: SanitationProgramPanel,
  structures: StructuresProgramPanel,
  transport_and_logistics: TransportProgramPanel,
};
