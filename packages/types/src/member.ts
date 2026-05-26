import { z } from "zod";
import { Rank, Team } from "./roles";

// Used by the formal dietary questionnaire (its own page + dietary_requirements
// table). Not captured at signup.
export const DietaryTag = z.enum([
  "vegan",
  "vegetarian",
  "gluten_free",
  "nut_free",
  "soy_free",
  "dairy_free",
  "halal",
  "kosher",
  "low_fodmap",
  "allergy_other",
]);
export type DietaryTag = z.infer<typeof DietaryTag>;

export const EmergencyContact = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  relationship: z.string().min(1),
});

export const MembershipTier = z.enum(["full", "build_week_only"]);
export type MembershipTier = z.infer<typeof MembershipTier>;

export const SignupInput = z
  .object({
    fullName: z.string().min(1),
    passportNumber: z.string().min(1).optional(),
    saIdNumber: z
      .string()
      .regex(/^\d{13}$/, "South African ID number must be 13 digits")
      .optional(),
    skills: z.array(z.string()).default([]),
    previousAfrikaburns: z.number().int().nonnegative().default(0),
    previousBurningMans: z.number().int().nonnegative().default(0),
    firstTime: z.boolean().default(false),
    emergencyContacts: z.array(EmergencyContact).min(1).max(2),
    membershipTier: MembershipTier,
    termsVersion: z.string(),
    termsConsentedAt: z.string().datetime(),
  })
  .refine((d) => d.passportNumber !== undefined || d.saIdNumber !== undefined, {
    message: "Either a passport number or SA ID number is required",
    path: ["passportNumber"],
  });
export type SignupInput = z.infer<typeof SignupInput>;

export const MemberProfile = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  displayName: z.string(),
  rank: Rank,
  teams: z.array(Team).default([]),
  duesPaid: z.boolean().default(false),
  sanitised: z.boolean().default(false),
});
export type MemberProfile = z.infer<typeof MemberProfile>;
