import { and, eq, sql } from "drizzle-orm";
import { canEditTeamProgram } from "@camp404/core";
import type { Team } from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { createHttpDb, withTransaction } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";

// Team programs (docs/specs/2026-09-27-team-programs.md): what a team's own
// program says about the team: its description. No links (owner,
// 2026-09-27): everything happens inside the app.
//
//  - Every approved member reads them (the page gates the reader).
//  - Only a captain or a lead OF THAT TEAM writes (owner's ruling 1,
//    canEditTeamProgram). The write re-reads the actor's rank and the teams
//    they lead this year INSIDE its own transaction (lockSenderReach), so a
//    demotion that committed first is seen and one that comes later waits. A
//    caller passes only who is acting, never a rank or a team list.
//  - Every write is a compare-and-set on `version` (0 = nothing saved yet):
//    a lost race says so in a sentence, never overwrites.
//  - Every write records an audit_log row in the SAME transaction: a team's
//    description is camp config every member reads.
//
// The caller checks the text with TeamProgramInput (@camp404/types) first;
// the table's CHECKs are the last guard.
//
// PGlite has ONE connection: everything inside the transaction goes through
// `tx`, never createHttpDb().

export const NOT_A_TEAM_EDITOR =
  "Only captains and this team's leads can change what its program says.";
export const TEAM_PROGRAM_CHANGED =
  "Someone changed this team's description first. Reload the page.";

export interface TeamProgram {
  team: Team;
  description: string;
  /** 0 when nothing has been saved for the team yet. */
  version: number;
  updatedAt: Date | null;
}

export type TeamProgramWriteResult =
  | { ok: true; version: number }
  | { ok: false; error: string };

function empty(team: Team): TeamProgram {
  return { team, description: "", version: 0, updatedAt: null };
}

async function read(db: DbOrTx, team: Team): Promise<TeamProgram> {
  const [row] = await db
    .select()
    .from(schema.teamPrograms)
    .where(eq(schema.teamPrograms.team, team));
  if (!row) return empty(team);
  return {
    team: row.team,
    description: row.description,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

/** A team's description, or the empty program (version 0). */
export async function getTeamProgram(team: Team): Promise<TeamProgram> {
  return read(createHttpDb(), team);
}

/**
 * Save a team's description, as `actorId`. Refuses anyone but a
 * captain or a lead of that team this year, re-read inside the transaction.
 * The input must already have passed TeamProgramInput.
 */
export async function saveTeamProgram(input: {
  actorId: string;
  team: Team;
  description: string;
  expectedVersion: number;
}): Promise<TeamProgramWriteResult> {
  return withTransaction(async (tx) => {
    const reach = await lockSenderReach(tx, input.actorId);
    if (!canEditTeamProgram(reachRank(reach), reach ?? [], input.team)) {
      return { ok: false, error: NOT_A_TEAM_EDITOR } as const;
    }
    const now = new Date();
    const values = {
      description: input.description,
      updatedAt: now,
    };
    const [row] =
      input.expectedVersion === 0
        ? await tx
            .insert(schema.teamPrograms)
            .values({ team: input.team, ...values, version: 1 })
            .onConflictDoNothing({ target: schema.teamPrograms.team })
            .returning({ version: schema.teamPrograms.version })
        : await tx
            .update(schema.teamPrograms)
            .set({
              ...values,
              version: sql`${schema.teamPrograms.version} + 1`,
            })
            .where(
              and(
                eq(schema.teamPrograms.team, input.team),
                eq(schema.teamPrograms.version, input.expectedVersion),
              ),
            )
            .returning({ version: schema.teamPrograms.version });
    if (!row) return { ok: false, error: TEAM_PROGRAM_CHANGED } as const;
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "team.program_changed",
      target: input.team,
      metadata: {
        team: input.team,
        version: row.version,
        description: input.description || null,
      },
    });
    return { ok: true, version: row.version } as const;
  });
}
