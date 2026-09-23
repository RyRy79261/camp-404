// What this deployment is set up with, derived from its env and one database
// probe. A library only: the owner chose no /captains/system page
// (2026-09-16, no Pencil board draws one).
//
// Three rules:
//
//  1. Never print a secret. A check says whether a value is SET and what
//     follows from that. The database HOSTNAME is the one value shown: it
//     answers "which database is this?" and is not a credential. Text from
//     outside (a driver error) goes through `redactSecrets`, and
//     __tests__/system-status.test.ts seeds every secret with a marker and
//     proves no marker reaches any string.
//  2. Derive, do not duplicate. Each rule comes from the code that applies it
//     (lib/integration-config.ts, lib/env.ts, lib/cron-stub.ts), so the report
//     cannot disagree with what the app does.
//  3. Say why. "Off: email notices are not sent" ends the search; "Off" alone
//     starts one.
//
// Pure: no `server-only`, no `process.env`, no database. lib/system-probe.ts is
// the server half that reads the real env and runs the probe.

import { redactSecrets } from "@camp404/core";
import { CRON_STUBS } from "./cron-stub";
import { PGCRYPTO_KEY_MIN_LENGTH } from "./env";
import {
  envList,
  feedbackTracker,
  firebaseAdminCredentials,
  isEmailConfigured,
  isWebPushConfigured,
  MIN_PREAPPROVED_ENV_CODE_LENGTH,
  webPushConfigFromEnv,
  type EnvBag,
} from "./integration-config";

/**
 * How a check reads at a glance. `degraded` is an optional service that is off
 * and fails honestly. `attention` is something that is wrong. Keep them apart:
 * if every unset key shouted, nobody would look.
 */
export type CheckTone = "ok" | "degraded" | "attention" | "info";

export interface SystemCheck {
  id: string;
  label: string;
  /** The state, short enough for a badge. Never a secret value. */
  value: string;
  tone: CheckTone;
  /** Why it is in that state, and what follows. */
  detail: string;
  /** The env var NAMES that decide it. Names only, never values. */
  env?: readonly string[];
}

export interface SystemStatus {
  /** What the camp needs to run at all. */
  core: SystemCheck[];
  /** Services the camp works without. */
  optional: SystemCheck[];
  /** The worst thing in the report, named. */
  headline: { tone: CheckTone; summary: string };
}

/** The live database probe lib/system-probe.ts runs. */
export type DatabaseProbe =
  | { kind: "not_configured" }
  | {
      kind: "ok";
      latencyMs: number;
      /** Real captains, erased and system accounts excluded. */
      captainCount: number;
      /** Whether first-time setup stamped its latch. */
      bootstrapped: boolean;
    }
  | { kind: "unreachable"; message: string };

/** The host of a connection string, or null. Parsed, so no password comes along. */
export function databaseHost(
  connectionString: string | undefined,
): string | null {
  if (!connectionString) return null;
  try {
    return new URL(connectionString).hostname || null;
  } catch {
    return null;
  }
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// --- Core ---------------------------------------------------------------

function databaseCheck(env: EnvBag, probe: DatabaseProbe): SystemCheck {
  const base = { id: "database", label: "Database", env: ["DATABASE_URL"] };
  const host = databaseHost(env.DATABASE_URL);
  const where = host ? ` Host: ${host}.` : "";
  if (probe.kind === "not_configured") {
    return {
      ...base,
      value: "Not set",
      tone: "attention",
      detail:
        "DATABASE_URL is not set. The app builds with a placeholder, and every page that reads data fails.",
    };
  }
  if (probe.kind === "unreachable") {
    return {
      ...base,
      value: "Unreachable",
      tone: "attention",
      detail: `A test query failed.${where} Error: ${redactSecrets(probe.message, env)}`,
    };
  }
  return {
    ...base,
    value: `Connected · ${probe.latencyMs} ms`,
    tone: "ok",
    detail: `One test query answered in ${probe.latencyMs} ms.${where}`,
  };
}

function setupCheck(probe: DatabaseProbe): SystemCheck {
  const base = { id: "setup", label: "First-time setup" };
  if (probe.kind !== "ok") {
    return {
      ...base,
      value: "Unknown",
      tone: "info",
      detail: "The database did not answer, so this cannot be read.",
    };
  }
  if (probe.captainCount > 0) {
    return {
      ...base,
      value: `Done · ${plural(probe.captainCount, "captain", "captains")}`,
      tone: "ok",
      detail: "The camp has a captain, so /setup is closed.",
    };
  }
  if (probe.bootstrapped) {
    return {
      ...base,
      value: "Done · no captains",
      tone: "attention",
      detail:
        "Setup ran, but no captain is left. Nobody can approve members, send questionnaires or promote a new captain.",
    };
  }
  return {
    ...base,
    value: "Not done",
    tone: "attention",
    detail:
      "No captain exists yet. The next person who signs in goes to /setup and can become the founding captain.",
  };
}

/** Below this a signing secret is guessable; Better Auth's docs ask for 32+. */
const AUTH_SECRET_MIN_LENGTH = 32;

function signInCheck(env: EnvBag): SystemCheck {
  const base = {
    id: "sign-in",
    label: "Sign-in",
    env: ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "AUTH_APEX_DOMAIN"],
  };
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    return {
      ...base,
      value: "Not set",
      tone: "attention",
      detail:
        "BETTER_AUTH_SECRET is missing, so sign-in is switched off on this deployment. Nobody can sign in until it is set.",
    };
  }
  if (secret.length < AUTH_SECRET_MIN_LENGTH) {
    return {
      ...base,
      value: "Secret too short",
      tone: "attention",
      detail: `The signing secret must be at least ${AUTH_SECRET_MIN_LENGTH} characters. This one is ${secret.length}.`,
    };
  }
  if (!env.BETTER_AUTH_URL?.trim()) {
    return {
      ...base,
      value: "Address not set",
      tone: "attention",
      detail:
        "BETTER_AUTH_URL is missing, so reset links and the Google return use Vercel's production host. Set it to the address members visit.",
    };
  }
  return {
    ...base,
    value: "Set",
    tone: "ok",
    detail: env.AUTH_APEX_DOMAIN?.trim()
      ? `Sign-in has its secret and address. Passkeys are tied to ${env.AUTH_APEX_DOMAIN.trim()}.`
      : "Sign-in has its secret and address. Set AUTH_APEX_DOMAIN so a passkey works on the bare domain and www alike.",
  };
}

function encryptionCheck(env: EnvBag): SystemCheck {
  const base = {
    id: "encryption-key",
    label: "ID number encryption",
    env: ["PGCRYPTO_KEY"],
  };
  const key = env.PGCRYPTO_KEY;
  if (!key) {
    return {
      ...base,
      value: "Not set",
      tone: "attention",
      detail:
        "SA ID and passport numbers are encrypted with this key. Without it the app refuses to start.",
    };
  }
  // The length is safe to show. The key is not.
  if (key.length < PGCRYPTO_KEY_MIN_LENGTH) {
    return {
      ...base,
      value: "Too short",
      tone: "attention",
      detail: `The key must be at least ${PGCRYPTO_KEY_MIN_LENGTH} characters. This one is ${key.length}, so the app refuses to start.`,
    };
  }
  return {
    ...base,
    value: "Set",
    tone: "ok",
    detail:
      "ID numbers are encrypted at rest. If this key is lost, stored ID numbers cannot be read.",
  };
}

function scheduledJobsCheck(env: EnvBag): SystemCheck {
  const base = {
    id: "scheduled-jobs",
    label: "Scheduled jobs",
    env: ["CRON_SECRET"],
  };
  const stubs = Object.keys(CRON_STUBS);
  const stubNote = stubs.length
    ? ` Not built yet, so they do nothing: ${stubs.join(", ")}.`
    : "";
  if (!env.CRON_SECRET) {
    const production = env.VERCEL_ENV === "production";
    return {
      ...base,
      value: "Refused · no secret",
      tone: production ? "attention" : "degraded",
      detail: `CRON_SECRET is not set, so every scheduled job is refused. Reminders, notices, push, email and the daily maintenance do not run.${stubNote}`,
    };
  }
  return {
    ...base,
    value: "Authorised",
    tone: "ok",
    detail: `Scheduled jobs must send CRON_SECRET, and they do.${stubNote}`,
  };
}

function deploymentCheck(env: EnvBag): SystemCheck {
  const stage = env.VERCEL_ENV ?? env.NODE_ENV ?? "development";
  const base = {
    id: "deployment",
    label: "This deployment",
    env: ["VERCEL_ENV", "NODE_ENV", "E2E_TEST_MODE"],
  };
  if (env.E2E_TEST_MODE === "1") {
    return {
      ...base,
      value: `${stage} · test mode on`,
      tone: "attention",
      detail:
        "E2E_TEST_MODE is on. It lets anyone sign in as anyone and uses an in-memory store. Only a local test run may have it.",
    };
  }
  return {
    ...base,
    value: stage,
    tone: "info",
    detail: `Running as ${stage}.`,
  };
}

// --- Optional -----------------------------------------------------------

function pushCheck(env: EnvBag): SystemCheck {
  const base = {
    id: "push",
    label: "Push notifications",
    env: [
      "FIREBASE_PROJECT_ID",
      "FIREBASE_CLIENT_EMAIL",
      "FIREBASE_PRIVATE_KEY",
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
    ],
  };
  const server = firebaseAdminCredentials(env) !== null;
  const browser = isWebPushConfigured(webPushConfigFromEnv(env));
  if (server && browser) {
    return {
      ...base,
      value: "On",
      tone: "ok",
      detail: "Members can turn on push, and the push job sends to them.",
    };
  }
  if (!server && !browser) {
    return {
      ...base,
      value: "Off",
      tone: "degraded",
      detail:
        "Firebase is not set. Notices still arrive in each member's inbox, but no phone buzzes.",
    };
  }
  return {
    ...base,
    value: server
      ? "Half set · browser keys missing"
      : "Half set · server keys missing",
    tone: "attention",
    detail: server
      ? "The server can send, but members cannot turn push on, so nobody gets a push."
      : "Members can turn push on, but the push job cannot send, so their tokens get nothing.",
  };
}

function emailCheck(env: EnvBag): SystemCheck {
  const base = {
    id: "email",
    label: "Email notices",
    env: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
  };
  return isEmailConfigured(env)
    ? {
        ...base,
        value: "On",
        tone: "ok",
        detail: "Notices that ask for email go out through Resend.",
      }
    : {
        ...base,
        value: "Off",
        tone: "degraded",
        detail:
          "Resend needs both the key and a from-address. Until then the email job answers 503 and marks nothing sent.",
      };
}

function uploadsCheck(env: EnvBag): SystemCheck {
  const base = {
    id: "uploads",
    label: "File uploads",
    env: ["BLOB_READ_WRITE_TOKEN"],
  };
  return env.BLOB_READ_WRITE_TOKEN
    ? {
        ...base,
        value: "On",
        tone: "ok",
        detail:
          "Profile photos and questionnaire images go to the private Vercel Blob store.",
      }
    : {
        ...base,
        value: "Off",
        tone: "degraded",
        detail:
          "No Vercel Blob token. Photo and image uploads say they are not set up, and nothing is saved.",
      };
}

function bugReportsCheck(env: EnvBag): SystemCheck {
  const base = {
    id: "bug-reports",
    label: "Bug reports",
    env: ["GITHUB_FEEDBACK_TOKEN", "GITHUB_FEEDBACK_REPO"],
  };
  const tracker = feedbackTracker(env);
  if (tracker.ok) {
    return {
      ...base,
      value: `Files to ${tracker.owner}/${tracker.name}`,
      tone: "ok",
      detail:
        'The profile\'s "Bugs and feature requests" card, and a shake, open a GitHub issue in this repository.',
    };
  }
  return tracker.reason === "no_token"
    ? {
        ...base,
        value: "Off",
        tone: "degraded",
        detail:
          "No GitHub token. The reporter still opens and tells the member it is not set up yet.",
      }
    : {
        ...base,
        value: "Repository name is wrong",
        tone: "attention",
        detail:
          "GITHUB_FEEDBACK_REPO must be owner/name. Every report fails until it is fixed.",
      };
}

function aiCheck(env: EnvBag): SystemCheck {
  const base = {
    id: "ai",
    label: "AI report tidy-up",
    env: ["ANTHROPIC_API_KEY"],
  };
  return env.ANTHROPIC_API_KEY
    ? {
        ...base,
        value: "On",
        tone: "ok",
        detail:
          "Improve with AI rewrites a report into a title and steps before it is filed.",
      }
    : {
        ...base,
        value: "Off",
        tone: "degraded",
        detail: "Improve with AI files the plain report instead.",
      };
}

function voiceCheck(env: EnvBag): SystemCheck {
  const base = {
    id: "voice",
    label: "Voice answers",
    env: ["GROQ_API_KEY"],
  };
  return env.GROQ_API_KEY
    ? {
        ...base,
        value: "On",
        tone: "ok",
        detail: "Spoken answers are written out by Groq.",
      }
    : {
        ...base,
        value: "Off",
        tone: "degraded",
        detail:
          'The voice button answers "Voice not configured". Typing still works.',
      };
}

function telegramCheck(env: EnvBag): SystemCheck {
  const base = {
    id: "telegram",
    label: "Telegram",
    env: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"],
  };
  const set = Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET);
  return {
    ...base,
    value: set ? "Keys set · not scheduled" : "Off",
    tone: "info",
    detail: set
      ? "The bot keys are set, but nothing queues Telegram posts and its job is not on the schedule."
      : "Not in use. Nothing queues Telegram posts, and its job is not on the schedule.",
  };
}

function inviteCodesCheck(env: EnvBag): SystemCheck {
  const base = {
    id: "env-invite-codes",
    label: "Invite codes in settings",
    env: ["INVITE_CODES"],
  };
  // Counts only. The codes are credentials.
  const codes = envList(env.INVITE_CODES);
  if (codes.length === 0) {
    return {
      ...base,
      value: "None",
      tone: "info",
      detail: "Members join with codes made in the app, from /tools/invite.",
    };
  }
  const pending = codes.filter(
    (code) => code.length < MIN_PREAPPROVED_ENV_CODE_LENGTH,
  ).length;
  return {
    ...base,
    value: plural(codes.length, "code", "codes"),
    tone: "info",
    detail:
      pending === 0
        ? "These codes never run out, and each one lets its user straight in."
        : `These codes never run out. ${plural(pending, "is", "are")} shorter than ${MIN_PREAPPROVED_ENV_CODE_LENGTH} characters, so people who use ${pending === 1 ? "it" : "them"} wait for a captain's approval.`,
  };
}

function recoveryEmailsCheck(env: EnvBag): SystemCheck {
  // Count only. The addresses are people's email addresses.
  const count = envList(env.GOD_EMAILS).length;
  return {
    id: "recovery-emails",
    label: "Recovery addresses",
    env: ["GOD_EMAILS"],
    value: count === 0 ? "None" : plural(count, "address", "addresses"),
    tone: "info",
    detail:
      count === 0
        ? "No address can skip the invite and approval gates."
        : "A listed address skips the invite and approval gates, but only once its email is verified.",
  };
}

// --- Report -------------------------------------------------------------

function worstTone(checks: readonly SystemCheck[]): CheckTone {
  if (checks.some((c) => c.tone === "attention")) return "attention";
  if (checks.some((c) => c.tone === "degraded")) return "degraded";
  return "ok";
}

/** The whole report. Pure: the same env and probe give the same report. */
export function deriveSystemStatus(
  env: EnvBag,
  probe: DatabaseProbe,
): SystemStatus {
  const core = [
    databaseCheck(env, probe),
    setupCheck(probe),
    signInCheck(env),
    encryptionCheck(env),
    scheduledJobsCheck(env),
    deploymentCheck(env),
  ];
  const optional = [
    pushCheck(env),
    emailCheck(env),
    uploadsCheck(env),
    bugReportsCheck(env),
    aiCheck(env),
    voiceCheck(env),
    telegramCheck(env),
    inviteCodesCheck(env),
    recoveryEmailsCheck(env),
  ];
  const all = [...core, ...optional];
  const tone = worstTone(all);
  // Name the checks, so the headline is sometimes the whole answer.
  const named = (t: CheckTone) =>
    all
      .filter((c) => c.tone === t)
      .map((c) => c.label.toLowerCase())
      .join(", ");
  const summary =
    tone === "attention"
      ? `Needs attention: ${named("attention")}.`
      : tone === "degraded"
        ? `Running without: ${named("degraded")}. Each one is off and says so.`
        : "Everything this report checks is set up and answering.";
  return { core, optional, headline: { tone, summary } };
}
