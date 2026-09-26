import { eq } from "drizzle-orm";
import {
  DesktopLayout,
  parseStoredDesktopLayout,
  type DesktopLayout as Layout,
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
