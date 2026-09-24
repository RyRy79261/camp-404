import { SECRET_ENV_KEYS } from "@camp404/core";
import { describe, expect, it } from "vitest";
import {
  databaseHost,
  deriveSystemStatus,
  type DatabaseProbe,
  type SystemCheck,
} from "../system-status";
import type { EnvBag } from "../integration-config";

// The first block is the promise: no secret is ever printed. It is proved by
// construction. Every secret env var holds a marker, every string the report
// can produce is flattened, and no marker may survive.

const MARKER = "zzCAMP404-SECRET-MARKERzz";
const DB_HOST = "ep-quiet-marker-123456.eu-central-1.aws.neon.tech";

/** An env where every credential carries the marker, one way or another. */
function secretEnv(): EnvBag {
  const env: Record<string, string> = {};
  for (const name of SECRET_ENV_KEYS) env[name] = `${name}-${MARKER}`;
  return {
    ...env,
    DATABASE_URL: `postgres://neondb_owner:${MARKER}@${DB_HOST}/neondb?sslmode=require`,
    // Short enough to count as pending, and still the marker.
    INVITE_CODES: `${MARKER}, x-${MARKER}-long-enough-to-preapprove`,
    GOD_EMAILS: `${MARKER}@example.com, second-${MARKER}@example.com`,
    BETTER_AUTH_URL: "https://www.camp-404.com",
    GOOGLE_CALENDAR_ID: "camp@group.calendar.google.com",
    AUTH_APEX_DOMAIN: "camp-404.com",
    RESEND_FROM_EMAIL: "Camp 404 <notices@camp-404.com>",
    GITHUB_FEEDBACK_REPO: "RyRy79261/camp-404",
    FIREBASE_PROJECT_ID: "camp-404",
    NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "camp-404",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234:web:abcd",
    NEXT_PUBLIC_FIREBASE_VAPID_KEY: "public-vapid",
    VERCEL_ENV: "production",
  };
}

const OK_PROBE: DatabaseProbe = {
  kind: "ok",
  latencyMs: 12,
  captainCount: 2,
  bootstrapped: true,
};

const ALL_PROBES: DatabaseProbe[] = [
  { kind: "not_configured" },
  OK_PROBE,
  { kind: "ok", latencyMs: 3, captainCount: 0, bootstrapped: false },
  { kind: "ok", latencyMs: 3, captainCount: 0, bootstrapped: true },
  {
    // What a failing driver hands back: the URL it failed on, which here is
    // the POOLER host, not the URL in env, so only the URL pass can catch it.
    kind: "unreachable",
    message: `connect ECONNREFUSED postgres://neondb_owner:${MARKER}@ep-quiet-marker-123456-pooler.eu-central-1.aws.neon.tech/neondb`,
  },
  {
    // The exact URL env holds, echoed back.
    kind: "unreachable",
    message: `could not connect to postgres://neondb_owner:${MARKER}@${DB_HOST}/neondb?sslmode=require`,
  },
  {
    // A key logged by name, holding a value this process does not have.
    kind: "unreachable",
    message: `decrypt failed with PGCRYPTO_KEY=${MARKER}-rotated`,
  },
];

/** Every string the report could show, flattened. */
function renderedStrings(env: EnvBag, probe: DatabaseProbe): string[] {
  const status = deriveSystemStatus(env, probe);
  return [
    status.headline.summary,
    ...[...status.core, ...status.optional].flatMap((c) => [
      c.id,
      c.label,
      c.value,
      c.detail,
      ...(c.env ?? []),
    ]),
  ];
}

function check(env: EnvBag, probe: DatabaseProbe, id: string): SystemCheck {
  const status = deriveSystemStatus(env, probe);
  const found = [...status.core, ...status.optional].find((c) => c.id === id);
  if (!found) throw new Error(`no check with id ${id}`);
  return found;
}

describe("no secret is ever printed", () => {
  it("holds for every probe outcome with every credential set", () => {
    for (const probe of ALL_PROBES) {
      for (const text of renderedStrings(secretEnv(), probe)) {
        expect(text).not.toContain(MARKER);
      }
    }
  });

  it("holds when the driver error quotes a URL the env does not hold", () => {
    const env = secretEnv();
    const probe = ALL_PROBES[4]!;
    const db = check(env, probe, "database");
    expect(db.value).toBe("Unreachable");
    expect(db.detail).toContain("[redacted]@");
    expect(db.detail).not.toContain(MARKER);
  });

  it("holds with the env empty, where a mistake would echo undefined", () => {
    for (const probe of ALL_PROBES) {
      for (const text of renderedStrings({}, probe)) {
        expect(text).not.toContain(MARKER);
        expect(text).not.toContain("undefined");
      }
    }
  });

  it("does show the database host, which is not a credential", () => {
    const db = check(secretEnv(), OK_PROBE, "database");
    expect(db.detail).toContain(`Host: ${DB_HOST}.`);
  });
});

describe("databaseHost", () => {
  it("parses the host and never the password", () => {
    expect(databaseHost(`postgres://u:${MARKER}@${DB_HOST}:5432/db`)).toBe(
      DB_HOST,
    );
  });

  it("is null for nothing or a string that is not a URL", () => {
    expect(databaseHost(undefined)).toBeNull();
    expect(databaseHost("not a url")).toBeNull();
  });
});

describe("deriveSystemStatus", () => {
  it("names what needs attention in the headline", () => {
    const status = deriveSystemStatus({}, { kind: "not_configured" });
    expect(status.headline.tone).toBe("attention");
    expect(status.headline.summary).toContain("database");
    expect(status.headline.summary).toContain("sign-in");
  });

  it("calls an optional service that is off degraded, not attention", () => {
    const env = { ...secretEnv(), GROQ_API_KEY: undefined };
    const voice = check(env, OK_PROBE, "voice");
    expect(voice.tone).toBe("degraded");
    expect(voice.value).toBe("Off");
  });

  it("is ok when everything is set and answering", () => {
    const env = {
      ...secretEnv(),
      INVITE_CODES: undefined,
      BETTER_AUTH_SECRET: "c".repeat(40),
    };
    const status = deriveSystemStatus(env, OK_PROBE);
    expect(status.headline).toEqual({
      tone: "ok",
      summary: "Everything this report checks is set up and answering.",
    });
  });

  it("reads setup from the probe", () => {
    expect(check({}, OK_PROBE, "setup").value).toBe("Done · 2 captains");
    expect(check({}, ALL_PROBES[2]!, "setup").tone).toBe("attention");
    expect(check({}, ALL_PROBES[3]!, "setup").value).toBe("Done · no captains");
    expect(check({}, { kind: "not_configured" }, "setup").tone).toBe("info");
  });

  it("uses the app's own length rules for the keys", () => {
    const short = { PGCRYPTO_KEY: "short", BETTER_AUTH_SECRET: "short" };
    expect(check(short, OK_PROBE, "encryption-key").value).toBe("Too short");
    expect(check(short, OK_PROBE, "encryption-key").detail).toContain(
      "This one is 5",
    );
    expect(check(short, OK_PROBE, "sign-in").tone).toBe("attention");
  });

  it("says whether Home can read the camp calendar", () => {
    expect(check({}, OK_PROBE, "calendar").value).toBe("Not connected");
    expect(
      check({ GOOGLE_CALENDAR_ID: "cal" }, OK_PROBE, "calendar").tone,
    ).toBe("attention");
    expect(
      check(
        {
          GOOGLE_CALENDAR_ID: "cal",
          GOOGLE_CALENDAR_CLIENT_EMAIL: "e",
        },
        OK_PROBE,
        "calendar",
      ).tone,
    ).toBe("attention");
    // Firebase's push account no longer reads the calendar.
    expect(
      check(
        {
          GOOGLE_CALENDAR_ID: "cal",
          FIREBASE_PROJECT_ID: "p",
          FIREBASE_CLIENT_EMAIL: "e",
          FIREBASE_PRIVATE_KEY: "k",
        },
        OK_PROBE,
        "calendar",
      ).tone,
    ).toBe("attention");
    expect(
      check(
        {
          GOOGLE_CALENDAR_ID: "cal",
          GOOGLE_CALENDAR_CLIENT_EMAIL: "e",
          GOOGLE_CALENDAR_PRIVATE_KEY: "k",
        },
        OK_PROBE,
        "calendar",
      ).tone,
    ).toBe("ok");
  });

  it("flags half-set push as attention", () => {
    const serverOnly = {
      FIREBASE_PROJECT_ID: "p",
      FIREBASE_CLIENT_EMAIL: "e",
      FIREBASE_PRIVATE_KEY: "k",
    };
    const push = check(serverOnly, OK_PROBE, "push");
    expect(push.tone).toBe("attention");
    expect(push.value).toBe("Half set · browser keys missing");
    expect(check({}, OK_PROBE, "push").tone).toBe("degraded");
  });

  it("counts invite codes and says which land as pending", () => {
    const codes = check(
      { INVITE_CODES: "short-one, another-short, this-one-is-long-enough-yes" },
      OK_PROBE,
      "env-invite-codes",
    );
    expect(codes.value).toBe("3 codes");
    expect(codes.detail).toContain("2 are shorter than 20 characters");
  });

  it("flags test mode on any deployment", () => {
    const deployment = check({ E2E_TEST_MODE: "1" }, OK_PROBE, "deployment");
    expect(deployment.tone).toBe("attention");
  });

  it("flags a bug-report repo that is not owner/name", () => {
    const reports = check(
      { GITHUB_FEEDBACK_TOKEN: "t", GITHUB_FEEDBACK_REPO: "just-a-name" },
      OK_PROBE,
      "bug-reports",
    );
    expect(reports.tone).toBe("attention");
  });
});
