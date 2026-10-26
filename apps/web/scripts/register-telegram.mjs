// Registers Ol' Jeb's webhook and command menu with Telegram on each
// production deploy, so nobody ever runs a command by hand. Run by
// `vercel-build` after the migrations. It does nothing unless VERCEL_ENV is
// "production" and TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are set, and
// it never fails the build: a problem is one warning line, never the token.

// The production origin that answers without a redirect: the bare domain
// (SITE_URL in lib/site.ts) sends every request on to www with a 307, and
// Telegram does not follow redirects, so a webhook on the bare domain never
// reaches the app. Never VERCEL_URL: a preview's protection answers Telegram
// 403, and Telegram would retry forever.
export const PRODUCTION_ORIGIN = "https://www.camp-404.com";

export const WEBHOOK_PATH = "/api/telegram/webhook";

/** What Ol' Jeb reads; anything left out is never delivered. */
export const ALLOWED_UPDATES = ["message", "my_chat_member", "chat_member"];

export const COMMANDS = [
  { command: "start", description: "Connect from your Profile in Camp 404" },
  { command: "stop", description: "Stop my camp notices" },
];

/**
 * Register the webhook and the commands. Answers what it did, for the log:
 * "skipped", "registered", or a warning sentence.
 */
export async function registerTelegram({ env, fetchImpl = fetch }) {
  if (env.VERCEL_ENV !== "production") return "skipped";
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!token || !secret) return "skipped";

  const call = async (method, payload) => {
    const res = await fetchImpl(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      throw new Error(`${method} answered ${data.error_code ?? res.status}`);
    }
  };

  try {
    await call("setWebhook", {
      url: `${PRODUCTION_ORIGIN}${WEBHOOK_PATH}`,
      secret_token: secret,
      allowed_updates: ALLOWED_UPDATES,
    });
    await call("setMyCommands", { commands: COMMANDS });
    return "registered";
  } catch (err) {
    // The error's own words only: the URL that holds the token is never in it.
    const reason = err instanceof Error ? err.message : "unknown error";
    return `warning: could not register Ol' Jeb with Telegram (${reason.replaceAll(token, "<token>")})`;
  }
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  registerTelegram({ env: process.env })
    .then((outcome) => console.log(`[telegram] ${outcome}`))
    .catch(() => console.log("[telegram] warning: registration did not run"))
    .finally(() => process.exit(0));
}
