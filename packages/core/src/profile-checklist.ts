// "Your profile isn't finished" (owner's mock-up, step 6, 2026-10-27): the
// gaps in a member's own profile that make the camp's job harder, as ONE
// grouped notice in the bell and the inbox and a card on Profile. Each line
// links to where it is fixed and ticks itself once it is. Worked out on every
// read from the member's own row, never stored as notice rows, and never a
// block: nothing here may gate a page.

/** What the checklist reads about the member, all from their own row. */
export interface ProfileFacts {
  /** Approved by the captains: only an approved member gets the checklist. */
  approved: boolean;
  /**
   * Held by a blocking questionnaire. The held desktop is a picture with no
   * live parts, so the checklist stays out of it.
   */
  held: boolean;
  displayName: string | null;
  /** Their Telegram username, as stored (with or without "@"). */
  telegramHandle: string | null;
  /** Connected to Ol' Jeb for private notices (`users.telegram_dm_at`). */
  telegramConnected: boolean;
  hasEmergencyContact: boolean;
}

export type ProfileGapKey =
  | "telegram_connect"
  | "telegram_username"
  | "display_name"
  | "emergency_contact";

export interface ProfileChecklistItem {
  key: ProfileGapKey;
  /** The link's words. */
  label: string;
  /** Plain words after or under the link, or null. */
  hint: string | null;
  /** Where it is fixed. */
  href: string;
  done: boolean;
}

export interface ProfileChecklist {
  items: ProfileChecklistItem[];
  /** How many lines are not done yet. */
  missing: number;
}

/** Where a member edits their name and photo. */
export const PROFILE_EDIT_PATH = "/profile/edit";
/** The Profile page's Telegram card. */
export const PROFILE_TELEGRAM_PATH = "/profile#telegram";
/** The burner profile in My forms: the Telegram username and emergency contacts. */
export const BURNER_PROFILE_FORM_PATH = "/tools/forms/burner_profile";

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Whether a display name is really an address: empty (the app then shows the
 * sign-in email in its place) or shaped like an email.
 */
export function displayNameIsEmail(name: string | null): boolean {
  const trimmed = name?.trim() ?? "";
  return trimmed === "" || EMAIL_LIKE.test(trimmed);
}

/**
 * The member's checklist, or null when they get none: not approved yet, or
 * held by a blocking questionnaire. `telegramOffered` is false when Ol' Jeb
 * is not set up here (no bot username): there is then nothing to connect, so
 * that line is left out.
 */
export function profileChecklist(
  facts: ProfileFacts | null,
  options: { telegramOffered: boolean },
): ProfileChecklist | null {
  if (!facts || !facts.approved || facts.held) return null;
  const handle = facts.telegramHandle?.trim().replace(/^@+/, "") ?? "";
  const items: ProfileChecklistItem[] = [];
  if (options.telegramOffered) {
    items.push({
      key: "telegram_connect",
      label: "Connect Telegram",
      hint: "to get your notices from Ol' Jeb",
      href: PROFILE_TELEGRAM_PATH,
      done: facts.telegramConnected,
    });
  }
  items.push(
    {
      key: "telegram_username",
      label: "Add your Telegram username",
      hint: "So Ol' Jeb can tag you in the camp's chat",
      href: BURNER_PROFILE_FORM_PATH,
      done: handle !== "",
    },
    {
      key: "display_name",
      label: "Pick a display name",
      hint: "Yours is still your email address",
      href: PROFILE_EDIT_PATH,
      done: !displayNameIsEmail(facts.displayName),
    },
    {
      key: "emergency_contact",
      label: "Add an emergency contact",
      hint: null,
      href: BURNER_PROFILE_FORM_PATH,
      done: facts.hasEmergencyContact,
    },
  );
  return { items, missing: items.filter((i) => !i.done).length };
}

/** "Your profile isn't finished: 3 things missing". */
export function profileChecklistTitle(missing: number): string {
  return `Your profile isn't finished: ${missing} ${missing === 1 ? "thing" : "things"} missing`;
}
