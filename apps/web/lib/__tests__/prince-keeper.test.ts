import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  E2E_REUNION_DELAY_MS,
  isPrinceKeeper,
  princeKeeperEmails,
  reunionDelayMs,
} from "../prince-keeper";

const WEB = path.resolve(__dirname, "../..");
const REPO = path.resolve(WEB, "../..");

/** Every source file under `dir`, tests and build output left out. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(
      (e) =>
        e.isFile() &&
        /\.(ts|tsx|js|mjs)$/.test(e.name) &&
        !/\.(test|spec)\.[jt]sx?$/.test(e.name),
    )
    .map((e) => path.join(e.parentPath, e.name))
    .filter((f) => !/[\\/](node_modules|\.next|__tests__|tests)[\\/]/.test(f));
}

const ENV = { PRINCE_KEEPER_EMAILS: " Keeper@Example.com , other@x.io,," };

describe("who sees Prince come home", () => {
  it("reads a trimmed, lower-cased comma list, empty when unset", () => {
    expect(princeKeeperEmails(ENV)).toEqual([
      "keeper@example.com",
      "other@x.io",
    ]);
    expect(princeKeeperEmails({})).toEqual([]);
    expect(princeKeeperEmails({ PRINCE_KEEPER_EMAILS: " , " })).toEqual([]);
  });

  it("is a listed address the member has confirmed, in any case", () => {
    expect(
      isPrinceKeeper(ENV, {
        primaryEmail: "KEEPER@example.COM",
        emailVerified: true,
      }),
    ).toBe(true);
    expect(
      isPrinceKeeper(ENV, { primaryEmail: "other@x.io", emailVerified: true }),
    ).toBe(true);
  });

  it("is nobody else: an unlisted address, an unconfirmed one, none, or no list", () => {
    expect(
      isPrinceKeeper(ENV, {
        primaryEmail: "someone@example.com",
        emailVerified: true,
      }),
    ).toBe(false);
    // Sign-up is open: an unconfirmed account could hold her address.
    expect(
      isPrinceKeeper(ENV, {
        primaryEmail: "keeper@example.com",
        emailVerified: false,
      }),
    ).toBe(false);
    expect(
      isPrinceKeeper(ENV, { primaryEmail: null, emailVerified: true }),
    ).toBe(false);
    expect(isPrinceKeeper(ENV, null)).toBe(false);
    expect(
      isPrinceKeeper(
        {},
        { primaryEmail: "keeper@example.com", emailVerified: true },
      ),
    ).toBe(false);
    // Never a match on an empty entry.
    expect(
      isPrinceKeeper(
        { PRINCE_KEEPER_EMAILS: "," },
        { primaryEmail: " ", emailVerified: true },
      ),
    ).toBe(false);
  });
});

describe("the empty clock's wait before she walks on", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is the scene's own 30 s, shortened only under the E2E harness", () => {
    vi.stubEnv("E2E_TEST_MODE", "");
    expect(reunionDelayMs()).toBeUndefined();
    vi.stubEnv("E2E_TEST_MODE", "1");
    expect(reunionDelayMs()).toBe(E2E_REUNION_DELAY_MS);
    expect(E2E_REUNION_DELAY_MS).toBeLessThan(30_000);
  });
});

describe("the address list never reaches a browser", () => {
  const files = [
    ...["app", "components", "lib"].flatMap((d) => sources(path.join(WEB, d))),
    ...["games", "os"].flatMap((p) =>
      sources(path.join(REPO, "packages", p, "src")),
    ),
  ];

  it("is read in one server-only module and nowhere else", () => {
    const keeper = readFileSync(path.join(WEB, "lib/prince-keeper.ts"), "utf8");
    expect(keeper.startsWith('import "server-only";')).toBe(true);
    const readers = files
      .filter((f) => readFileSync(f, "utf8").includes("PRINCE_KEEPER"))
      .map((f) => path.relative(WEB, f));
    expect(readers).toEqual(["lib/prince-keeper.ts"]);
    // Nothing copies it into the client bundle.
    const nextConfig = readFileSync(path.join(WEB, "next.config.ts"), "utf8");
    expect(nextConfig).not.toContain("PRINCE_KEEPER");
  });

  it("no client module imports the gate; the desktop is handed a yes or no", () => {
    const clientImporters = files
      .map((f) => [f, readFileSync(f, "utf8")] as const)
      .filter(
        ([, src]) =>
          /^\s*["']use client["']/.test(src) &&
          /from\s+["'][^"']*prince-keeper["']/.test(src),
      )
      .map(([f]) => path.relative(WEB, f));
    expect(clientImporters).toEqual([]);
    const layout = readFileSync(
      path.join(WEB, "app/(console)/layout.tsx"),
      "utf8",
    );
    expect(layout).toMatch(
      /princeKeeper=\{isPrinceKeeper\(process\.env, authUser\)\}/,
    );
    // And the answer is a boolean, never the list or the address.
    expect(
      typeof isPrinceKeeper(ENV, {
        primaryEmail: "keeper@example.com",
        emailVerified: true,
      }),
    ).toBe("boolean");
  });
});
