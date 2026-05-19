import { z } from "zod";

export const Role = z.enum([
  "admin",
  "treasurer",
  "team_lead",
  "member",
  "agent",
]);
export type Role = z.infer<typeof Role>;

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
