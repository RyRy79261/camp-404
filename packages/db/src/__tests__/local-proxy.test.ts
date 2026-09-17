import { neonConfig } from "@neondatabase/serverless";
import { afterEach, describe, expect, it, vi } from "vitest";

// NEON_LOCAL_PROXY=1 routes BOTH Neon drivers to the local proxy, for the
// local host only. Building a driver makes no connection, so this runs offline.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("local proxy routing", () => {
  it("sends the local host's HTTP and WebSocket traffic to the proxy, and nothing else", async () => {
    vi.stubEnv("NEON_LOCAL_PROXY", "1");
    vi.stubEnv(
      "DATABASE_URL",
      "postgres://postgres:postgres@db.localtest.me:5432/main",
    );
    const { createHttpDb } = await import("../index");
    createHttpDb();

    const fetchEndpoint = neonConfig.fetchEndpoint as (host: string) => string;
    const wsProxy = neonConfig.wsProxy as (host: string) => string;
    expect(fetchEndpoint("db.localtest.me")).toBe(
      "http://db.localtest.me:4444/sql",
    );
    expect(wsProxy("db.localtest.me")).toBe("db.localtest.me:4444/v2");
    expect(fetchEndpoint("ep-cool.eu-central-1.aws.neon.tech")).toBe(
      "https://ep-cool.eu-central-1.aws.neon.tech/sql",
    );
    expect(neonConfig.useSecureWebSocket).toBe(false);
  });
});
