// MCP OAuth policy (what the routes check before touching the store) and the
// store itself, re-exported from @camp404/db/mcp-oauth so route imports stay
// put. The store's concurrency (single-use codes, refresh rotation) is tested
// against real Postgres in packages/db.

import { DEFAULT_SCOPE } from "@camp404/db/mcp-oauth";

export {
  ACCESS_TOKEN_TTL_SEC,
  AUTH_CODE_TTL_SEC,
  consumeAuthCode,
  DEFAULT_SCOPE,
  findClient,
  issueAccessToken,
  issueAuthCode,
  REFRESH_TOKEN_TTL_SEC,
  registerClient,
  rotateRefreshToken,
  verifyClientSecret,
  type ConsumedAuthCode,
  type IssueAuthCodeInput,
  type IssuedTokens,
  type RegisterClientInput,
  type RegisteredClient,
} from "@camp404/db/mcp-oauth";
// Single coarse scope for now. Per-tool scopes can carve this later.
const ALLOWED_SCOPES = new Set([DEFAULT_SCOPE]);

export function isAllowedScope(scope: string): boolean {
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .every((s) => ALLOWED_SCOPES.has(s));
}

// --- Redirect URI allow-list (DCR hardening) -----------------------------
// DCR is unauthenticated by design (RFC 7591). Hardening rule: only allow
// localhost (any port) or claude.ai / anthropic.com subdomains. Tightens
// the attack surface for anyone hitting /register.
//
// RFC 6749 §3.1.2 and OAuth 2.1: a redirect URI is absolute and carries no
// fragment; and one with a user name or password in it is refused too, since
// no real client needs one and it can disguise the host.
export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (uri.includes("#")) return false;
    if (u.username !== "" || u.password !== "") return false;
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (isLoopback) return u.protocol === "http:" || u.protocol === "https:";
    if (u.protocol !== "https:") return false;
    return (
      u.hostname === "claude.ai" ||
      u.hostname.endsWith(".claude.ai") ||
      u.hostname === "anthropic.com" ||
      u.hostname.endsWith(".anthropic.com")
    );
  } catch {
    return false;
  }
}
