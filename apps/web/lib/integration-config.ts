// Whether each optional service is set up, decided from an env bag.
//
// Pure: no `server-only`, no `process.env` read of its own. The code that uses
// a service passes `process.env`, and the system status report
// (lib/system-status.ts) passes the same bag, so the report can never disagree
// with what the service actually does. Names and counts only: nothing here
// returns a secret for display.

/** An env bag. `process.env` fits, and so does a small object in a test. */
export type EnvBag = Readonly<Record<string, string | undefined>>;

/** A comma-separated env list, trimmed, with empty entries dropped. */
export function envList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * An `INVITE_CODES` value shorter than this lands its redeemer as pending, for
 * a captain to approve. Env codes never run out, and sign-up is open to anyone,
 * so a short, guessable one must not let people straight into the camp: the
 * same rule the owner chose for the public founder code (2026-09-16). A long
 * random value keeps the old pre-approved behaviour, and nobody has to rotate
 * the setting for the camp to be safe.
 */
export const MIN_PREAPPROVED_ENV_CODE_LENGTH = 20;

/** Email notices need both the Resend key and a verified from-address. */
export function isEmailConfigured(env: EnvBag): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}

export interface FirebaseAdminCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** The server push credentials, or null when any of the three is missing. */
export function firebaseAdminCredentials(
  env: EnvBag,
): FirebaseAdminCredentials | null {
  const projectId = env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const rawKey = env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !rawKey) return null;
  // Env stores the PEM with literal `\n`; cert() needs real newlines.
  return { projectId, clientEmail, privateKey: rawKey.replace(/\\n/g, "\n") };
}

/** The browser push settings. All are public by design. */
export interface WebPushConfig {
  apiKey: string | undefined;
  projectId: string | undefined;
  messagingSenderId: string | undefined;
  appId: string | undefined;
  vapidKey: string | undefined;
}

/**
 * The browser push settings read from an env bag. The browser bundle cannot
 * use this: Next inlines only a literal `process.env.NEXT_PUBLIC_…` read, so
 * lib/firebase-client.ts builds the same object from literal reads.
 */
export function webPushConfigFromEnv(env: EnvBag): WebPushConfig {
  return {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    vapidKey: env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  };
}

/** Whether a browser can ask for a push token. */
export function isWebPushConfigured(config: WebPushConfig): boolean {
  return Boolean(
    config.apiKey &&
    config.projectId &&
    config.messagingSenderId &&
    config.appId &&
    config.vapidKey,
  );
}

export const DEFAULT_FEEDBACK_REPO = "RyRy79261/camp-404";

/**
 * What a member is told when a report has nowhere to go. One copy, read by the
 * server action that returns it AND by the profile card that warns about it in
 * advance — the card used to quote the no-token wording for both reasons, so a
 * malformed repo sent the member to a captain with the wrong symptom.
 */
export const FEEDBACK_UNAVAILABLE_MESSAGE: Record<
  "no_token" | "bad_repo",
  string
> = {
  no_token: "Feedback isn't set up yet. Let a camp captain know.",
  bad_repo: "Feedback isn't configured correctly. Let a camp captain know.",
};

export type FeedbackTracker =
  | { ok: true; token: string; owner: string; name: string }
  | { ok: false; reason: "no_token" | "bad_repo" };

/** The GitHub token and repo that bug reports go to, or why they can't. */
export function feedbackTracker(env: EnvBag): FeedbackTracker {
  const token = env.GITHUB_FEEDBACK_TOKEN;
  if (!token) return { ok: false, reason: "no_token" };
  const repo = (env.GITHUB_FEEDBACK_REPO || DEFAULT_FEEDBACK_REPO).trim();
  const segments = repo
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length !== 2) return { ok: false, reason: "bad_repo" };
  return { ok: true, token, owner: segments[0]!, name: segments[1]! };
}
