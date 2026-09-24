import { describe, expect, it } from "vitest";

import {
  SECRET_ENV_KEYS,
  describeRedactions,
  redactPii,
  redactSecrets,
  sanitizeReportText,
} from "../text-redaction";

const redact = (text: string) => redactPii(text).text;

describe("redactPii", () => {
  it("redacts emails, phone numbers, ID and card numbers, and says so", () => {
    const out = redactPii(
      "reach me at jane@example.com or +27 82 555 1234, ID 8001015009087, card 4111 1111 1111 1111",
    );
    expect(out.text).not.toContain("jane@example.com");
    expect(out.text).toContain("[email]");
    expect(out.text).toContain("[phone]");
    expect(out.text).toContain("[id]");
    expect(out.text).toContain("[card]");
    expect(out.redacted).toEqual(["email", "phone", "id-number", "card"]);
  });

  it("fully redacts international phone numbers — no trailing digit group leaks", () => {
    for (const n of [
      "+27 82 555 1234",
      "+1 415 555 2671",
      "+44 20 7946 0958",
      "+49-123-4567890",
    ]) {
      expect(redact(n)).toBe("[phone]");
    }
  });

  it("redacts space-separated local phone numbers", () => {
    expect(redact("082 555 1234")).toBe("[phone]");
    expect(redact("call 082 555 1234 please")).toContain("[phone]");
  });

  it("redacts secrets: bearer tokens, JWTs, API keys, and token-bearing URLs", () => {
    expect(redact("Authorization: Bearer abc.def-123")).toContain(
      "Bearer [token]",
    );
    expect(redact("token eyJhbGciOiJ.eyJzdWIiOiI.SflKxwRJ0eK")).toContain(
      "[jwt]",
    );
    expect(redact("key sk-livedeadbeef0123456789")).toContain("[secret]");
    expect(redact("ghp_0123456789abcdef0123456789abcdef")).toContain(
      "[secret]",
    );
    const url = redactPii("see https://x.io/d?token=supersecretvalue123");
    expect(url.text).not.toContain("supersecretvalue123");
    expect(url.text).toContain("[redacted]");
    expect(url.redacted).toEqual(["secret"]);
  });

  it("redacts a whole UUID, with no false [card] and no digits left", () => {
    for (const uuid of [
      "12345678-1234-1234-1234-123456789012",
      "3f2c9a1e-7b4d-4e8f-9c0a-1d2e3f4a5b6c",
    ]) {
      const out = redactPii(`member ${uuid} failed`);
      expect(out.text).toBe("member [uuid] failed");
      expect(out.redacted).toEqual(["uuid"]);
    }
  });

  it("redacts member and payment references whole", () => {
    expect(redact("ref C404-M017 paid C404-M017-2027-1")).toBe(
      "ref [ref] paid [ref]",
    );
  });

  it("removes a JSON object whole, nested contents included", () => {
    const out = redactPii(
      'render failed: {"name":"Alice Hatter","meta":{"allergy":"nuts"}} at row 3',
    );
    expect(out.text).toBe("render failed: [structured data removed] at row 3");
    expect(out.redacted).toEqual(["structured-data"]);
  });

  it("removes a JSON array of names", () => {
    expect(redact('crew ["Alice Hatter","Bob Rabbit"] missing')).toBe(
      "crew [structured data removed] missing",
    );
  });

  it("leaves an unbalanced bracket for the other rules", () => {
    expect(redact("{ oops jane@example.com")).toBe("{ oops [email]");
  });

  it("keeps its own placeholders, and their kinds, on a second pass", () => {
    const once = redactPii('mail jane@example.com, Bearer abc123, {"a":1}');
    const twice = redactPii(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.redacted).toEqual(once.redacted);
  });

  it("finds nothing in plain text", () => {
    expect(redactPii("The publish button does nothing.")).toEqual({
      text: "The publish button does nothing.",
      redacted: [],
    });
  });
});

describe("sanitizeReportText", () => {
  it("strips HTML tags and trims", () => {
    expect(
      sanitizeReportText("  <script>alert(1)</script>hello  ", 100).text,
    ).toBe("alert(1)hello");
  });

  it("keeps an unterminated < and the text after it", () => {
    expect(sanitizeReportText("Expected count < 10, got NaN", 100).text).toBe(
      "Expected count < 10, got NaN",
    );
  });

  it("strips a long run of < in linear time", () => {
    const started = Date.now();
    sanitizeReportText("<".repeat(50_000), 100);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("caps length", () => {
    expect(sanitizeReportText("word ".repeat(50), 10).text).toHaveLength(10);
  });

  it("returns nothing found for empty input", () => {
    expect(sanitizeReportText("", 10)).toEqual({ text: "", redacted: [] });
  });
});

describe("describeRedactions", () => {
  it("names what was removed, and never claims the report is anonymous", () => {
    const note = describeRedactions(["email", "phone"]);
    expect(note).toContain("email addresses, phone numbers");
    expect(note).toContain("can miss things");
    expect(note.toLowerCase()).not.toContain("anonym");
  });

  it("says nothing was recognised, with the same caveat", () => {
    const note = describeRedactions([]);
    expect(note).toContain("No personal data was recognised");
    expect(note).toContain("can miss things");
  });
});

describe("redactSecrets", () => {
  const env = {
    PGCRYPTO_KEY: "s3cret-pgcrypto-key-value",
    DATABASE_URL:
      "postgres://user:hunter2@ep-cool.neon.tech/db?sslmode=require",
    CRON_SECRET: "ab",
    NODE_ENV: "production",
  };

  it("redacts a real env value wherever it appears", () => {
    const out = redactSecrets(
      "decrypt failed for key s3cret-pgcrypto-key-value",
      env,
    );
    expect(out).not.toContain("s3cret-pgcrypto-key-value");
    expect(out).toContain("[redacted:PGCRYPTO_KEY]");
  });

  it("matches values literally, regex metacharacters and all", () => {
    const out = redactSecrets(`connect ECONNREFUSED ${env.DATABASE_URL}`, env);
    expect(out).not.toContain("hunter2");
    expect(out).toBe("connect ECONNREFUSED [redacted:DATABASE_URL]");
  });

  it("leaves a value shorter than the minimum alone", () => {
    // CRON_SECRET is "ab" here — redacting it would shred ordinary prose.
    expect(redactSecrets("about a cabbage", env)).toBe("about a cabbage");
  });

  it("does not touch env vars that aren't secrets", () => {
    expect(redactSecrets("running in production mode", env)).toBe(
      "running in production mode",
    );
  });

  it("redacts by name even when this process doesn't hold the value", () => {
    const out = redactSecrets(
      'TELEGRAM_BOT_TOKEN="123456:rotated-elsewhere"',
      env,
    );
    expect(out).not.toContain("rotated-elsewhere");
    expect(out).toBe("TELEGRAM_BOT_TOKEN=[redacted:TELEGRAM_BOT_TOKEN]");
  });

  it("is idempotent", () => {
    const text = `PGCRYPTO_KEY=${env.PGCRYPTO_KEY} against ${env.DATABASE_URL}`;
    const once = redactSecrets(text, env);
    expect(redactSecrets(once, env)).toBe(once);
  });

  it("removes the credentials from a URL this process does not hold", () => {
    const out = redactSecrets(
      "connect failed: postgres://neondb_owner:rotated-pw@ep-x-pooler.neon.tech/db?sslmode=require",
      env,
    );
    expect(out).not.toContain("rotated-pw");
    expect(out).not.toContain("neondb_owner");
    expect(out).toBe(
      "connect failed: postgres://[redacted]@ep-x-pooler.neon.tech/db?sslmode=require",
    );
    expect(redactSecrets(out, env)).toBe(out);
  });

  it("leaves a URL with no credentials alone", () => {
    expect(redactSecrets("see https://camp-404.com/setup", env)).toBe(
      "see https://camp-404.com/setup",
    );
  });

  it("covers Camp 404's nineteen secret-bearing env names", () => {
    expect(SECRET_ENV_KEYS).toHaveLength(19);
    expect(new Set(SECRET_ENV_KEYS).size).toBe(19);
    // The calendar's own service account (2026-09-23), apart from Firebase's.
    expect(SECRET_ENV_KEYS).toContain("GOOGLE_CALENDAR_PRIVATE_KEY");
    // The sign-in signing secret replaced Neon Auth's cookie secret; the old
    // name is read by nothing, so listing it would hide nothing.
    expect(SECRET_ENV_KEYS).toContain("BETTER_AUTH_SECRET");
    expect(SECRET_ENV_KEYS).toContain("GOOGLE_CLIENT_SECRET");
    expect(SECRET_ENV_KEYS as readonly string[]).not.toContain(
      "NEON_AUTH_COOKIE_SECRET",
    );
  });

  it("returns empty for empty input", () => {
    expect(redactSecrets("", env)).toBe("");
  });
});
