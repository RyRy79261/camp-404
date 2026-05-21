import { z } from "zod";

// Global rank ladder: captain > team_lead > member. `captain` carries god
// rights in-app. Per-team leadership is recorded on team_memberships.is_lead.
export const Rank = z.enum(["captain", "team_lead", "member"]);
export type Rank = z.infer<typeof Rank>;

// The camp's working teams. Keep in sync with `teamEnum` in
// @camp404/db's schema.ts — the database is the source of truth.
export const Team = z.enum([
  "kitchen",
  "structures",
  "power_and_lighting",
  "sanitation_and_water",
  "health_and_safety",
  "art_and_activities",
  "ministry_of_memes",
  "ministry_of_vibes",
]);
export type Team = z.infer<typeof Team>;
