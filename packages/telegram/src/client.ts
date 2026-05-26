/**
 * Minimal Telegram Bot API client. The Bot API is plain HTTPS + JSON so
 * we use `fetch` directly instead of a heavyweight library — every method
 * we need (sendMessage, createChatInviteLink, getMe, setWebhook,
 * getChatAdministrators) is one POST.
 *
 * Docs: https://core.telegram.org/bots/api
 */

const DEFAULT_BASE_URL = "https://api.telegram.org";

export interface TelegramClientOptions {
  botToken: string;
  /** Override the base URL (e.g. for tests or self-hosted bot-api). */
  baseUrl?: string;
  /** Inject a custom fetch (for tests). */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms. Defaults to 10_000 (10 s). */
  timeoutMs?: number;
}

export class TelegramApiError extends Error {
  readonly errorCode: number;
  readonly description: string;

  constructor(errorCode: number, description: string) {
    super(`Telegram API error ${errorCode}: ${description}`);
    this.name = "TelegramApiError";
    this.errorCode = errorCode;
    this.description = description;
  }
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export interface ChatInviteLink {
  invite_link: string;
  name?: string;
  creates_join_request?: boolean;
  is_primary?: boolean;
  is_revoked?: boolean;
  expire_date?: number;
  member_limit?: number;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string; title?: string; username?: string };
  date: number;
  text?: string;
}

export interface BotIdentity {
  id: number;
  is_bot: boolean;
  username?: string;
  first_name: string;
}

/** Thin wrapper around the Telegram Bot HTTP API. */
export class TelegramClient {
  private readonly botToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: TelegramClientOptions) {
    if (!opts.botToken) {
      throw new Error("TelegramClient: botToken is required");
    }
    this.botToken = opts.botToken;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async call<T>(method: string, payload?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/bot${this.botToken}/${method}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      });
      const data = (await res.json()) as TelegramApiResponse<T>;
      if (!data.ok || data.result === undefined) {
        throw new TelegramApiError(
          data.error_code ?? res.status,
          data.description ?? "unknown error",
        );
      }
      return data.result;
    } finally {
      clearTimeout(timer);
    }
  }

  getMe(): Promise<BotIdentity> {
    return this.call<BotIdentity>("getMe");
  }

  /**
   * Create a single-use invite link to a chat the bot administers.
   * `memberLimit: 1` makes the link expire after one join — exactly what
   * we want per-user. `expireDate` is a unix timestamp (seconds).
   */
  createChatInviteLink(input: {
    chatId: string | number;
    name?: string;
    expireDate?: number;
    memberLimit?: number;
    createsJoinRequest?: boolean;
  }): Promise<ChatInviteLink> {
    return this.call<ChatInviteLink>("createChatInviteLink", {
      chat_id: input.chatId,
      name: input.name,
      expire_date: input.expireDate,
      member_limit: input.memberLimit,
      creates_join_request: input.createsJoinRequest,
    });
  }

  revokeChatInviteLink(input: {
    chatId: string | number;
    inviteLink: string;
  }): Promise<ChatInviteLink> {
    return this.call<ChatInviteLink>("revokeChatInviteLink", {
      chat_id: input.chatId,
      invite_link: input.inviteLink,
    });
  }

  sendMessage(input: {
    chatId: string | number;
    text: string;
    parseMode?: "MarkdownV2" | "HTML";
    disableNotification?: boolean;
    disableWebPagePreview?: boolean;
  }): Promise<TelegramMessage> {
    return this.call<TelegramMessage>("sendMessage", {
      chat_id: input.chatId,
      text: input.text,
      parse_mode: input.parseMode,
      disable_notification: input.disableNotification,
      disable_web_page_preview: input.disableWebPagePreview,
    });
  }

  setWebhook(input: {
    url: string;
    secretToken?: string;
    /** Telegram update kinds we want delivered. */
    allowedUpdates?: string[];
  }): Promise<true> {
    return this.call<true>("setWebhook", {
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: input.allowedUpdates,
    });
  }

  deleteWebhook(): Promise<true> {
    return this.call<true>("deleteWebhook");
  }
}

/**
 * Telegram's MarkdownV2 requires a fixed set of characters to be escaped
 * with a backslash whenever they appear in literal text. Failing to escape
 * causes the API to reject the message.
 * https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
