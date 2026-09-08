// Field-privacy law. The two classes below decide, for any one piece of a
// member's data, whether another human may ever see it — and they are the
// SINGLE source of that answer, so the rule the UI renders and the rule the
// server enforces cannot drift apart.
//
// Camp 404 keeps most answers as question ids in the `burner_profiles.responses`
// JSONB map, and the rest as columns on `users` / `dietary_requirements`. So a
// "key" here is the name the field goes by where it actually lives: the question
// id for a JSONB answer (`id.number`), the Drizzle property name for a column
// (`emergencyContacts`). Both namespaces are flat and neither collides, so one
// set covers both.
//
// Pure and dependency-free — the same import works in a server action, an MCP
// tool, and a client component.

/**
 * Never shown to another member, at any rank, for any reason. There is no
 * emergency in which someone else needs a government ID number or your banking
 * details; the owner and captains read the ID through the deliberate,
 * audited decrypt path in camp-management, not through a member-facing view.
 *
 * `id.number` is the plaintext answer key (`ID_NUMBER_KEY` in
 * `@camp404/db/id-documents`); the three `*Encrypted` names are the `users`
 * columns it and the EFT details are persisted to.
 */
export const ALWAYS_PRIVATE: ReadonlySet<string> = new Set([
  "id.number",
  "passportEncrypted",
  "saIdEncrypted",
  "eftDetailsEncrypted",
]);

/**
 * Shown to whoever needs it when something has gone wrong — the medic, the
 * kitchen, the captain making the call at 3am. Private in the ordinary course,
 * but withholding it is the more dangerous failure, so these are exempt from
 * the default deny rather than lumped in with self-expression answers.
 *
 * `emergencyContacts` is the `users` column; `allergies` and `isAnaphylactic`
 * are the `dietary_requirements` columns (the camp's only dietary source of
 * truth — there are no dietary columns on `users`).
 */
export const SAFETY_VISIBLE: ReadonlySet<string> = new Set([
  "emergencyContacts",
  "allergies",
  "isAnaphylactic",
]);

/** The minimum a caller's field descriptor must carry to be classified. */
export interface PrivacyField {
  /** Locked by the questionnaire/config author, independent of the law below. */
  locked?: boolean;
}

/**
 * Whether a field is locked away from other members.
 *
 * Derived, never stored: an `ALWAYS_PRIVATE` key is locked no matter what the
 * field descriptor says, and any other field is locked only if its author
 * marked it so. This is the whole point of the module — a caller that renders
 * `isFieldLocked(...)` and a caller that enforces it get the same answer, and
 * adding a key to `ALWAYS_PRIVATE` locks every surface at once.
 */
export function isFieldLocked(key: string, field?: PrivacyField): boolean {
  return ALWAYS_PRIVATE.has(key) || field?.locked === true;
}

/** Whether a field may be surfaced on a safety/emergency read. */
export function isSafetyVisible(key: string): boolean {
  return SAFETY_VISIBLE.has(key);
}
