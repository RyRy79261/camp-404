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
  "finance",
  "transport_and_logistics",
  "communications_and_hr",
  "mutant_vehicle",
  "sound",
  "water",
]);
export type Team = z.infer<typeof Team>;

// What each team is called until a captain renames it: the labels a new camp
// starts with (DEFAULT_TEAMS in @camp404/db/camp-config seeds the same ones, and
// a test guards the two against drift). Two keys outlived their names, and a
// key cannot be renamed because Postgres cannot drop an enum value:
// `sanitation_and_water` is Sanitation and MOOP (Water is its own team since
// 2026-09-24), and `health_and_safety` is Safety.
export const TEAM_DEFAULT_LABELS: Readonly<Record<Team, string>> = {
  kitchen: "Kitchen",
  structures: "Structures",
  power_and_lighting: "Power and Lighting",
  sanitation_and_water: "Sanitation and MOOP",
  health_and_safety: "Safety",
  art_and_activities: "Art and Activities",
  ministry_of_memes: "Ministry of Memes",
  ministry_of_vibes: "Ministry of Vibes",
  finance: "Finance",
  transport_and_logistics: "Transport and Logistics",
  communications_and_hr: "Communications & HR",
  mutant_vehicle: "Mutant Vehicle",
  sound: "Sound",
  water: "Water",
};

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
