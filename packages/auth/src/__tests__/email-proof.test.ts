import { beforeEach, describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { buildAuthOptions } from "../config";
import { CONFIRM_EMAIL_FIRST } from "../email-proof";

// The unconfirmed-email guards, driven through a real Better Auth instance:
// our exact options and plugins, with only the database swapped for Better
// Auth's in-memory adapter and the two mail senders swapped for a capture.
// Each case is an HTTP request to the auth handler, the way a browser (or an
// attacker) would send it.

const BASE = "http://localhost:3000";
const PASSWORD = "correct horse battery staple";

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let mail: { kind: "verify" | "reset"; url: string; token: string }[];

function makeAuth() {
  const options = buildAuthOptions({
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    BETTER_AUTH_URL: BASE,
  });
  return betterAuth({
    ...options,
    baseURL: BASE,
    database: memoryAdapter(db),
    emailAndPassword: {
      ...options.emailAndPassword,
      sendResetPassword: async ({ url, token }) => {
        mail.push({ kind: "reset", url, token });
      },
      onPasswordReset: async () => {},
    },
    emailVerification: {
      ...options.emailVerification,
      sendOnSignUp: false,
      sendVerificationEmail: async ({ url, token }) => {
        mail.push({ kind: "verify", url, token });
      },
    },
  });
}

let auth: ReturnType<typeof makeAuth>;

/** Cookie header from a response's Set-Cookie list, dropping cleared ones. */
function cookiesFrom(res: Response, prior = ""): string {
  const jar = new Map<string, string>();
  for (const pair of prior.split("; ").filter(Boolean)) {
    const [name, ...rest] = pair.split("=");
    jar.set(name!, rest.join("="));
  }
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const [name, ...rest] = pair!.split("=");
    const value = rest.join("=");
    if (value && !/max-age=0/i.test(line)) jar.set(name!, value);
    else jar.delete(name!);
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(
  path: string,
  init: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<Response> {
  const headers = new Headers({ origin: BASE });
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );
}

async function signUp(email: string) {
  const res = await call("/sign-up/email", {
    body: { email, password: PASSWORD, name: "Someone" },
  });
  expect(res.status).toBe(200);
  const user = db.user!.find((u) => u.email === email)!;
  return { cookie: cookiesFrom(res), userId: user.id as string };
}

function userRow(id: string): Row {
  return db.user!.find((u) => u.id === id)!;
}

function hasSessionCookie(res: Response): boolean {
  return res.headers
    .getSetCookie()
    .some(
      (line) =>
        line.startsWith("camp404.session_token=") &&
        !line.startsWith("camp404.session_token=;") &&
        !/max-age=0/i.test(line),
    );
}

beforeEach(() => {
  db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
    twoFactor: [],
    passkey: [],
  };
  mail = [];
  auth = makeAuth();
});

describe("enrolling a passkey or two-factor", () => {
  it("is refused while the email is unconfirmed", async () => {
    const { cookie } = await signUp("squatter@example.com");

    const twoFactor = await call("/two-factor/enable", {
      body: { password: PASSWORD },
      cookie,
    });
    expect(twoFactor.status).toBe(403);
    await expect(twoFactor.json()).resolves.toMatchObject({
      code: "EMAIL_NOT_VERIFIED",
      message: CONFIRM_EMAIL_FIRST,
    });
    expect(db.twoFactor).toEqual([]);

    const passkey = await call("/passkey/generate-register-options", {
      cookie,
    });
    expect(passkey.status).toBe(403);
  });

  it("is allowed once the email is confirmed, even before the cookie cache catches up", async () => {
    const { cookie, userId } = await signUp("owner@example.com");
    // Confirmed in the database; the session cookie still says unconfirmed.
    userRow(userId).emailVerified = true;

    const twoFactor = await call("/two-factor/enable", {
      body: { password: PASSWORD },
      cookie,
    });
    expect(twoFactor.status).toBe(200);

    const passkey = await call("/passkey/generate-register-options", {
      cookie,
    });
    expect(passkey.status).toBe(200);
  });
});

describe("a password reset on an unconfirmed account", () => {
  function enrol(userId: string) {
    db.passkey!.push({
      id: "pk1",
      userId,
      publicKey: "k",
      credentialID: "c",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
    });
    db.twoFactor!.push({
      id: "tf1",
      userId,
      secret: "s",
      backupCodes: "b",
      verified: true,
    });
    userRow(userId).twoFactorEnabled = true;
  }

  async function reset(email: string, newPassword = "a whole new passphrase") {
    const asked = await call("/request-password-reset", {
      body: { email, redirectTo: "/auth/reset-password" },
    });
    expect(asked.status).toBe(200);
    const link = mail.find((m) => m.kind === "reset")!;
    return call("/reset-password", {
      body: { token: link.token, newPassword },
    });
  }

  it("clears the passkeys and two-factor enrolled while nobody had proven the address", async () => {
    const { userId } = await signUp("owner@example.com");
    enrol(userId);

    const res = await reset("owner@example.com");
    expect(res.status).toBe(200);

    expect(db.passkey).toEqual([]);
    expect(db.twoFactor).toEqual([]);
    expect(userRow(userId).twoFactorEnabled).toBe(false);
  });

  it("keeps them on a confirmed account", async () => {
    const { userId } = await signUp("owner@example.com");
    userRow(userId).emailVerified = true;
    enrol(userId);

    expect((await reset("owner@example.com")).status).toBe(200);

    expect(db.passkey).toHaveLength(1);
    expect(db.twoFactor).toHaveLength(1);
    expect(userRow(userId).twoFactorEnabled).toBe(true);
  });

  it("keeps them when the reset itself is refused", async () => {
    const { userId } = await signUp("owner@example.com");
    enrol(userId);

    const res = await reset("owner@example.com", "short");
    expect(res.status).toBe(400);

    expect(db.passkey).toHaveLength(1);
    expect(db.twoFactor).toHaveLength(1);
  });
});

describe("a verification link", () => {
  async function linkFor(email: string): Promise<string> {
    // Unauthenticated, as anyone who knows the address can ask.
    const res = await call("/send-verification-email", {
      body: { email, callbackURL: "/" },
    });
    expect(res.status).toBe(200);
    return mail.find((m) => m.kind === "verify")!.url;
  }

  async function follow(url: string, cookie?: string) {
    const headers = new Headers();
    if (cookie) headers.set("cookie", cookie);
    return auth.handler(new Request(url, { headers, redirect: "manual" }));
  }

  it("never opens a session that skips two-factor", async () => {
    const { userId } = await signUp("owner@example.com");
    userRow(userId).twoFactorEnabled = true;
    db.session = [];
    const url = await linkFor("owner@example.com");

    const res = await follow(url);

    expect(res.status).toBe(302);
    expect(userRow(userId).emailVerified).toBe(true);
    expect(hasSessionCookie(res)).toBe(false);
    expect(db.session).toEqual([]);
  });

  it("still signs in an account without two-factor", async () => {
    // The control: the same link for an account without the code does sign
    // in, so the case above fails for the reason it names.
    const { userId } = await signUp("owner@example.com");
    db.session = [];
    const url = await linkFor("owner@example.com");

    const res = await follow(url);

    expect(hasSessionCookie(res)).toBe(true);
    expect(db.session!.filter((s) => s.userId === userId)).toHaveLength(1);
  });

  it("keeps the session of a browser already signed in to that account", async () => {
    const signedUp = await signUp("owner@example.com");
    const { userId } = signedUp;
    userRow(userId).twoFactorEnabled = true;
    // Drop the cached copy of the session so the server reads the account as
    // it is now, two-factor on.
    const cookie = signedUp.cookie
      .split("; ")
      .filter((pair) => !pair.startsWith("camp404.session_data"))
      .join("; ");
    const url = await linkFor("owner@example.com");

    const res = await follow(url, cookie);

    expect(res.status).toBe(302);
    expect(db.session!.filter((s) => s.userId === userId)).toHaveLength(1);
    const after = await call("/get-session", {
      cookie: cookiesFrom(res, cookie),
    });
    await expect(after.json()).resolves.toMatchObject({
      user: { emailVerified: true },
    });
  });
});
