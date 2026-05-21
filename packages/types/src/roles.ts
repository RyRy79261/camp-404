import { z } from "zod";

// Global rank ladder: captain > team_lead > member. `captain` carries god
// rights in-app. Per-team leadership is recorded on team_memberships.is_lead.
export const Rank = z.enum(["captain", "team_lead", "member"]);
export type Rank = z.infer<typeof Rank>;

export const Team = z.enum([
  "kitchen",
  "build",
  "fire",
  "art",
  "vehicle",
  "onboarding",
  "safety",
]);
export type Team = z.infer<typeof Team>;
