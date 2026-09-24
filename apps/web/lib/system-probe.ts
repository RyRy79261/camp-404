import "server-only";

import { redactSecrets } from "@camp404/core";
import { createHttpDb } from "@camp404/db";
import { getBootstrapState } from "@camp404/db/bootstrap";
import { sql } from "drizzle-orm";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";
import {
  deriveSystemStatus,
  type DatabaseProbe,
  type SystemStatus,
} from "./system-status";

// The server half of lib/system-status.ts: read the real env, ask the real
// database, hand both to the pure deriver.
//
// It probes, not infers: "DATABASE_URL is set" and "the database answers" are
// different claims. It never throws: a status report that fails with the thing
// it checks tells nobody anything.

/** How long a probe step may wait before the database counts as unreachable. */
export const PROBE_TIMEOUT_MS = 5_000;

async function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  // A dead database often stops answering instead of refusing, and an unbounded
  // await would hang until the platform kills the request.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${label} did not answer within ${PROBE_TIMEOUT_MS} ms.`,
              ),
            ),
          PROBE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One timed round trip, then the setup state. Reads getBootstrapState itself,
 * not isCampBootstrapped, which answers true in E2E test mode.
 */
export async function probeDatabase(): Promise<DatabaseProbe> {
  // The E2E twin: the in-memory store stands in for the database, and an E2E
  // run may have no DATABASE_URL at all. lib/bootstrap.ts treats the test
  // store as set up too.
  if (usesTestStore()) {
    return {
      kind: "ok",
      latencyMs: 0,
      captainCount: testStore.countCaptains(),
      bootstrapped: true,
    };
  }
  // Checked directly: the db client swaps in a build placeholder URL when this
  // is unset, and a probe against the placeholder would report "unreachable"
  // for what is really "not set".
  if (!process.env.DATABASE_URL) return { kind: "not_configured" };

  const startedAt = performance.now();
  try {
    await withTimeout(createHttpDb().execute(sql`select 1`), "The database");
    const latencyMs = Math.round(performance.now() - startedAt);
    const state = await withTimeout(getBootstrapState(), "The setup state");
    return {
      kind: "ok",
      latencyMs,
      captainCount: state.captainCount,
      bootstrapped: state.bootstrappedAt !== null,
    };
  } catch (err) {
    return {
      kind: "unreachable",
      // Redacted here and again in the deriver: a driver error quotes the URL
      // it failed on.
      message: redactSecrets(
        err instanceof Error ? err.message : String(err),
        process.env,
      ),
    };
  }
}

/** The whole report: the real env, the real probe, the pure deriver. */
export async function getSystemStatus(): Promise<SystemStatus> {
  return deriveSystemStatus(process.env, await probeDatabase());
}
