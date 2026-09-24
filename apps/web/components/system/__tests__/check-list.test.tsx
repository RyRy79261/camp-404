import { SECRET_ENV_KEYS } from "@camp404/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CheckListCard,
  TONE_LABEL,
  TONE_VARIANT,
} from "@/components/system/check-list";
import type { EnvBag } from "@/lib/integration-config";
import {
  deriveSystemStatus,
  type CheckTone,
  type DatabaseProbe,
  type SystemCheck,
} from "@/lib/system-status";

// What a captain's browser actually receives from the System status page. The
// deriver is already proved to print no secret (lib/__tests__/
// system-status.test.ts); this proves the card does not add one on the way to
// the screen. Every credential holds a marker, in the report's env AND in
// process.env, so a card that read a value from anywhere would show it.

const MARKER = "zzCAMP404-SECRET-MARKERzz";
const DB_HOST = "ep-quiet-marker-123456.eu-central-1.aws.neon.tech";

/** Built the way system-status.test.ts builds its marker env. */
function secretEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of SECRET_ENV_KEYS) env[name] = `${name}-${MARKER}`;
  return {
    ...env,
    DATABASE_URL: `postgres://neondb_owner:${MARKER}@${DB_HOST}/neondb?sslmode=require`,
    INVITE_CODES: `${MARKER}, x-${MARKER}-long-enough-to-preapprove`,
    GOD_EMAILS: `${MARKER}@example.com, second-${MARKER}@example.com`,
    BETTER_AUTH_URL: "https://www.camp-404.com",
    AUTH_APEX_DOMAIN: "camp-404.com",
    VERCEL_ENV: "production",
  };
}

const PROBES: DatabaseProbe[] = [
  { kind: "not_configured" },
  { kind: "ok", latencyMs: 12, captainCount: 2, bootstrapped: true },
  { kind: "ok", latencyMs: 3, captainCount: 0, bootstrapped: true },
  {
    kind: "unreachable",
    message: `could not connect to postgres://neondb_owner:${MARKER}@${DB_HOST}/neondb`,
  },
];

/** One of each tone: sign-in ok, voice degraded, database attention, setup info. */
const MIXED_ENV: EnvBag = { ...secretEnv(), GROQ_API_KEY: undefined };
const MIXED_PROBE = PROBES[3]!;

function renderReport(env: EnvBag, probe: DatabaseProbe) {
  const status = deriveSystemStatus(env, probe);
  return render(
    <>
      <CheckListCard
        title="Core services"
        description="Core"
        checks={status.core}
      />
      <CheckListCard
        title="Optional services"
        description="Optional"
        checks={status.optional}
      />
    </>,
  );
}

beforeEach(() => {
  for (const [name, value] of Object.entries(secretEnv())) {
    vi.stubEnv(name, value);
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("CheckListCard", () => {
  it("prints no secret, for any probe outcome", () => {
    for (const probe of PROBES) {
      const { container, unmount } = renderReport(secretEnv(), probe);
      expect(container.textContent).toContain("Database");
      expect(container.textContent).not.toContain(MARKER);
      unmount();
    }
  });

  it("names the settings that decide each check", () => {
    const { container } = renderReport(MIXED_ENV, MIXED_PROBE);
    const text = container.textContent ?? "";
    for (const name of [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "PGCRYPTO_KEY",
      "GROQ_API_KEY",
    ]) {
      expect(text).toContain(name);
    }
  });

  it("says each tone in words beside its badge, not by colour alone", () => {
    const status = deriveSystemStatus(MIXED_ENV, MIXED_PROBE);
    const all: SystemCheck[] = [...status.core, ...status.optional];
    renderReport(MIXED_ENV, MIXED_PROBE);

    const tones = Object.keys(TONE_LABEL) as CheckTone[];
    for (const tone of tones) {
      const sample = all.find((c) => c.tone === tone);
      if (!sample) throw new Error(`the fixture has no ${tone} check`);
      const term = screen.getByText(sample.label).closest("dt");
      expect(term?.textContent).toContain(`${TONE_LABEL[tone]}:`);
      expect(term?.textContent).toContain(sample.value);
    }
    // The four words are different, so no two tones read the same.
    expect(new Set(Object.values(TONE_LABEL)).size).toBe(tones.length);
  });

  it("paints only attention amber", () => {
    expect(TONE_VARIANT).toEqual({
      ok: "success",
      degraded: "secondary",
      attention: "warning",
      info: "outline",
    });
  });
});
