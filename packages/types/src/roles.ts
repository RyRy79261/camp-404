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

// --- Stored vs derived rank, and the viewer clearance ladder --------------
// The DATABASE stores only two ranks (schema.ts rankEnum). `team_lead` is
// DERIVED at read time from team_memberships.is_lead and is never stored — so
// the stored axis is distinct from the 3-member display `Rank` above.
export const StoredRank = z.enum(["captain", "member"]);
export type StoredRank = z.infer<typeof StoredRank>;

// Approval status — a separate axis from rank (schema.ts approvalStatusEnum).
export const ApprovalStatus = z.enum(["pending", "approved", "rejected"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

// The clearance ladder for the rank-layered UI (home rank sections,
// preview-but-locked gating), ordered low→high: camp_member < team_lead < captain.
export const ViewerRank = z.enum(["camp_member", "team_lead", "captain"]);
export type ViewerRank = z.infer<typeof ViewerRank>;
