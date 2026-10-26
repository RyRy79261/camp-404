import { describe, expect, it, vi } from "vitest";
import { SITE_URL } from "../site";
import {
  ALLOWED_UPDATES,
  PRODUCTION_ORIGIN,
  registerTelegram,
} from "../../scripts/register-telegram.mjs";

// Ol' Jeb's webhook is registered on each production deploy (vercel-build),
// so nobody runs a command by hand. It must never fail the build and never
// print the bot's token.

const TOKEN = "123456:secret-bot-token";
const env = {
  VERCEL_ENV: "production",
  TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_WEBHOOK_SECRET: "hook-secret",
};
const ok = () =>
  vi.fn(async () => new Response(JSON.stringify({ ok: true, result: true })));

describe("registerTelegram", () => {
  it("points the webhook at the production site's www host, never a preview", () => {
    // camp-404.com answers 307 to www, and Telegram does not follow redirects.
    expect(PRODUCTION_ORIGIN).toBe(
      SITE_URL.replace("https://", "https://www."),
    );
  });

  it("registers the webhook and the commands on production", async () => {
    const fetchImpl = ok();
    expect(await registerTelegram({ env, fetchImpl })).toBe("registered");
    const [webhook, commands] = fetchImpl.mock.calls as unknown as [
      [string, RequestInit],
      [string, RequestInit],
    ];
    expect(webhook[0]).toMatch(/\/setWebhook$/);
    expect(JSON.parse(webhook[1].body as string)).toEqual({
      url: "https://www.camp-404.com/api/telegram/webhook",
      secret_token: "hook-secret",
      allowed_updates: ALLOWED_UPDATES,
    });
    expect(ALLOWED_UPDATES).toEqual([
      "message",
      "my_chat_member",
      "chat_member",
    ]);
    expect(commands[0]).toMatch(/\/setMyCommands$/);
    expect(
      JSON.parse(commands[1].body as string).commands.map(
        (c: { command: string }) => c.command,
      ),
    ).toEqual(["start", "stop"]);
  });

  it("does nothing off production or without the token and secret", async () => {
    const fetchImpl = ok();
    for (const e of [
      { ...env, VERCEL_ENV: "preview" },
      { ...env, VERCEL_ENV: undefined },
      { ...env, TELEGRAM_BOT_TOKEN: "" },
      { ...env, TELEGRAM_WEBHOOK_SECRET: undefined },
    ]) {
      expect(await registerTelegram({ env: e, fetchImpl })).toBe("skipped");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers a warning, without the token, when Telegram refuses or is down", async () => {
    const refused = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error_code: 401 }), {
          status: 401,
        }),
    );
    const said = await registerTelegram({ env, fetchImpl: refused });
    expect(said).toMatch(/^warning: .*setWebhook answered 401/);
    expect(said).not.toContain(TOKEN);

    const down = vi.fn(async () => {
      throw new Error(
        `fetch failed for https://api.telegram.org/bot${TOKEN}/x`,
      );
    });
    const said2 = await registerTelegram({ env, fetchImpl: down });
    expect(said2).toMatch(/^warning: /);
    expect(said2).not.toContain(TOKEN);
  });
});
