import { z } from "zod";
import { checkTextFormat } from "./questionnaire";
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

// The same rules as the burner profile's contact questions: a name and a
// relationship of the questions' lengths, and a phone number the form's
// "phone" format accepts (7 to 15 digits).
export const EmergencyContact = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => checkTextFormat("phone", v) === null, {
      message: "Enter a valid phone number",
    }),
  relationship: z.string().trim().min(1).max(40),
});
export type EmergencyContact = z.infer<typeof EmergencyContact>;

export const MembershipTier = z.enum(["full", "build_week_only"]);
export type MembershipTier = z.infer<typeof MembershipTier>;

export const SignupInput = z.object({
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
