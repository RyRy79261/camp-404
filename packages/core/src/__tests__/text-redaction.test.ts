import { describe, expect, it } from "vitest";

import {
  SECRET_ENV_KEYS,
  redactPii,
  redactSecrets,
  sanitizeReportText,
} from "../text-redaction";

describe("redactPii", () => {
  it("redacts emails, phone numbers, ID and card numbers", () => {
    const out = redactPii(
      "reach me at jane@example.com or +27 82 555 1234, ID 8001015009087, card 4111 1111 1111 1111",
    );
    expect(out).not.toContain("jane@example.com");
    expect(out).toContain("[email]");
    expect(out).toContain("[phone]");
    expect(out).toContain("[id]");
    expect(out).toContain("[card]");
  });

  it("fully redacts international phone numbers — no trailing digit group leaks", () => {
    for (const n of [
      "+27 82 555 1234",
      "+1 415 555 2671",
      "+44 20 7946 0958",
      "+49-123-4567890",
    ]) {
      expect(redactPii(n)).toBe("[phone]");
    }
  });

  it("redacts space-separated local phone numbers", () => {
    expect(redactPii("082 555 1234")).toBe("[phone]");
    expect(redactPii("call 082 555 1234 please")).toContain("[phone]");
  });

  it("redacts secrets: bearer tokens, JWTs, API keys, and token-bearing URLs", () => {
    expect(redactPii("Authorization: Bearer abc.def-123")).toContain(
      "Bearer [token]",
    );
    expect(redactPii("token eyJhbGciOiJ.eyJzdWIiOiI.SflKxwRJ0eK")).toContain(
      "[jwt]",
    );
    expect(redactPii("key sk-livedeadbeef0123456789")).toContain("[secret]");
    expect(redactPii("ghp_0123456789abcdef0123456789abcdef")).toContain(
      "[secret]",
    );
    const url = redactPii("see https://x.io/d?token=supersecretvalue123");
    expect(url).not.toContain("supersecretvalue123");
    expect(url).toContain("[redacted]");
  });
});

describe("sanitizeReportText", () => {
  it("strips HTML tags and trims", () => {
    expect(sanitizeReportText("  <script>alert(1)</script>hello  ", 100)).toBe(
      "alert(1)hello",
    );
  });

  it("caps length", () => {
    expect(sanitizeReportText("a".repeat(50), 10)).toHaveLength(10);
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

  it("covers Camp 404's fourteen secret-bearing env names", () => {
    expect(SECRET_ENV_KEYS).toHaveLength(14);
    expect(new Set(SECRET_ENV_KEYS).size).toBe(14);
  });

  it("returns empty for empty input", () => {
    expect(redactSecrets("", env)).toBe("");
  });
});
