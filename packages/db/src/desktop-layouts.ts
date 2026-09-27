import { eq, sql } from "drizzle-orm";
import {
  DesktopLayout,
  DesktopPreferencesPatch,
  emptyDesktopLayout,
  parseStoredDesktopLayout,
  parseStoredDesktopPreferences,
  type DesktopLayout as Layout,
  type DesktopPreferences,
} from "@camp404/types";
import type { DbOrTx } from "./audit";
import { createHttpDb } from "./index";
import * as schema from "./schema";

// A member's 404 OS desktop layout (owner's decision 14 B): icon cells, their
// shortcuts and their folders, one JSONB row per member (`desktop_layouts`).
// Only the member writes their own row, so it is not a privileged write and
// has no audit row. Account erasure deletes it (account.ts). The app reads it
// with the member's manifest and prunes it there (apps/web/lib/desktop-layout.ts).

/** The value the write was given is not a desktop layout. */
export class DesktopLayoutInvalidError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join(" "));
  }
}

/**
 * The member's saved layout, or null when they have none or the stored value
 * is not a layout (an older shape): the caller draws the default then.
 */
export async function getDesktopLayout(
  userId: string,
  db: DbOrTx = createHttpDb(),
): Promise<Layout | null> {
  const [row] = await db
    .select({ layout: schema.desktopLayouts.layout })
    .from(schema.desktopLayouts)
    .where(eq(schema.desktopLayouts.userId, userId))
    .limit(1);
  return parseStoredDesktopLayout(row?.layout);
}

/**
 * Save the member's layout, replacing the one before. Checked here as well as
 * at the action, so nothing but a layout ever reaches the column. One
 * statement, so the stateless driver does it.
 */
export async function saveDesktopLayout(
  userId: string,
  layout: unknown,
  db: DbOrTx = createHttpDb(),
): Promise<Layout> {
  const parsed = DesktopLayout.safeParse(layout);
  if (!parsed.success) {
    throw new DesktopLayoutInvalidError(
      parsed.error.issues.map((issue) => issue.message),
    );
  }
  const now = new Date();
  await db
    .insert(schema.desktopLayouts)
    .values({ userId, layout: parsed.data, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.desktopLayouts.userId,
      set: { layout: parsed.data, updatedAt: now },
    });
  return parsed.data;
}

// --- Display preferences (issues #289 and #290) ----------------------------
// The member's theme, "Bigger text", "Effects off", "Open with one click" and
// when they closed the welcome wizard, in `preferences` on the same row. A
// write merges into what is stored in one statement (jsonb `||`), so two quick
// changes (a theme, then the wizard closing) never undo each other, and it
// never touches the layout. Erasure deletes the row, and these with it.

/** The value the write was given is not a preferences change. */
export class DesktopPreferencesInvalidError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join(" "));
  }
}

/**
 * The member's preferences: the defaults when they have no row or have chosen
 * nothing, and each stored field that fails its check as its default.
 */
export async function getDesktopPreferences(
  userId: string,
  db: DbOrTx = createHttpDb(),
): Promise<DesktopPreferences> {
  const [row] = await db
    .select({ preferences: schema.desktopLayouts.preferences })
    .from(schema.desktopLayouts)
    .where(eq(schema.desktopLayouts.userId, userId))
    .limit(1);
  return parseStoredDesktopPreferences(row?.preferences);
}

/**
 * Merge `value` into the member's stored preferences, in one statement, and
 * read back what is stored.
 */
async function mergePreferences(
  userId: string,
  value: Partial<DesktopPreferences>,
  db: DbOrTx,
): Promise<DesktopPreferences> {
  const now = new Date();
  await db
    .insert(schema.desktopLayouts)
    .values({
      userId,
      // No layout saved yet: the empty one, which reads as the default.
      layout: emptyDesktopLayout(),
      preferences: value,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.desktopLayouts.userId,
      set: {
        // A stored value that is not an object (a hand edit) is replaced,
        // not merged into.
        preferences: sql`(case when jsonb_typeof(${schema.desktopLayouts.preferences}) = 'object' then ${schema.desktopLayouts.preferences} else '{}'::jsonb end) || ${JSON.stringify(value)}::jsonb`,
        updatedAt: now,
      },
    });
  return getDesktopPreferences(userId, db);
}

/**
 * Change some of the member's own choices (theme, the switches, one click).
 * Checked here as well as at the action: anything else, including the
 * welcome's seen time, is refused and nothing is written.
 */
export async function saveDesktopPreferences(
  userId: string,
  patch: unknown,
  db: DbOrTx = createHttpDb(),
): Promise<DesktopPreferences> {
  const parsed = DesktopPreferencesPatch.safeParse(patch);
  if (!parsed.success) {
    throw new DesktopPreferencesInvalidError(
      parsed.error.issues.map((issue) => issue.message),
    );
  }
  return mergePreferences(userId, parsed.data, db);
}

/** The member closed the welcome wizard (Done, Skip for now, Esc or ×). */
export async function markWelcomeSeen(
  userId: string,
  at: Date = new Date(),
  db: DbOrTx = createHttpDb(),
): Promise<DesktopPreferences> {
  return mergePreferences(userId, { welcomeSeenAt: at.toISOString() }, db);
}
