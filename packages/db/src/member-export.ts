import { and, eq, sql } from "drizzle-orm";
import type { EmergencyContact } from "@camp404/types";
import { currentCycleNumber } from "./cycles";
import { createHttpDb } from "./index";
import * as schema from "./schema";

// The member export's data beyond the roster row: safety data for team leads
// and captains, and the captain-only columns. The roster itself comes from
// getCampManagementRoster, so the export lists the same members the roster
// does. Columns a viewer may not read are never selected, so they never leave
// the database for that request. Callers decide the rank; this only obeys it.

export interface MemberExportOptions {
  /** Emergency contacts and dietary data (team lead and up). */
  safety: boolean;
  /** Encrypted ID numbers and this year's arrival (captain). */
  captain: boolean;
}

export interface MemberExportExtras {
  userId: string;
  emergencyContacts: EmergencyContact[] | null;
  /** Raw burner profile answers, by question id. */
  dietaryAllergies: unknown;
  dietaryDislikes: unknown;
  dietaryNotes: unknown;
  /** dietary_requirements, filled through MCP; null when there is no row. */
  allergies: string | null;
  isAnaphylactic: boolean | null;
  notes: string | null;
  passportEncrypted: string | null;
  saIdEncrypted: string | null;
  arrivalAt: Date | null;
}

const NONE = sql<null>`null`;

export async function getMemberExportExtras(
  options: MemberExportOptions,
): Promise<MemberExportExtras[]> {
  if (!options.safety && !options.captain) return [];
  const db = createHttpDb();
  const safety = options.safety;
  const captain = options.captain;
  // Arrival is this year's driver profile; -1 matches no row when not asked.
  const cycle = captain ? await currentCycleNumber() : -1;
  const answer = (id: string) =>
    safety ? sql<unknown>`${schema.burnerProfiles.responses} -> ${id}` : NONE;

  return db
    .select({
      userId: schema.users.id,
      emergencyContacts: safety ? schema.users.emergencyContacts : NONE,
      dietaryAllergies: answer("dietary.allergies"),
      dietaryDislikes: answer("dietary.dislikes"),
      dietaryNotes: answer("dietary.notes"),
      allergies: safety ? schema.dietaryRequirements.allergies : NONE,
      isAnaphylactic: safety ? schema.dietaryRequirements.isAnaphylactic : NONE,
      notes: safety ? schema.dietaryRequirements.notes : NONE,
      passportEncrypted: captain ? schema.users.passportEncrypted : NONE,
      saIdEncrypted: captain ? schema.users.saIdEncrypted : NONE,
      arrivalAt: captain ? schema.driverProfiles.arrivalAt : NONE,
    })
    .from(schema.users)
    .leftJoin(
      schema.burnerProfiles,
      eq(schema.burnerProfiles.userId, schema.users.id),
    )
    .leftJoin(
      schema.dietaryRequirements,
      eq(schema.dietaryRequirements.userId, schema.users.id),
    )
    .leftJoin(
      schema.driverProfiles,
      and(
        eq(schema.driverProfiles.userId, schema.users.id),
        eq(schema.driverProfiles.cycle, cycle),
      ),
    )
    .where(
      and(eq(schema.users.isSystem, false), eq(schema.users.sanitised, false)),
    );
}
