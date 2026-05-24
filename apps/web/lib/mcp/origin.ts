/**
 * Resolve the public-facing origin of this deployment, in priority order:
 *
 *   1. `MCP_PUBLIC_URL` env override — set this on production deployments
 *      that sit behind a proxy or use a non-default custom domain.
 *   2. `x-forwarded-host` / `x-forwarded-proto` on the request — what
 *      Vercel / any proxy sets to the user's actual host. This wins over
 *      `VERCEL_URL` because the latter is the deployment-hash domain
 *      (e.g. `<app>-abc123.vercel.app`) which on production deployments
 *      is gated by Vercel SSO and would 403 Claude's discovery fetches.
 *   3. `host` header.
 *   4. `VERCEL_URL` env — last resort, only when no request is in scope.
 *   5. Local dev fallback.
 *
 * @see briefing.md gotcha #2 — "VERCEL_URL is the wrong issuer".
 */
export function getPublicOrigin(req?: Request): string {
  const override = process.env.MCP_PUBLIC_URL?.trim();
  if (override) return override.replace(/\/$/, "");

  if (req) {
    const fwdHost = req.headers.get("x-forwarded-host");
    const fwdProto = req.headers.get("x-forwarded-proto");
    if (fwdHost) return `${fwdProto ?? "https"}://${fwdHost}`;
    const host = req.headers.get("host");
    if (host) {
      const proto = fwdProto ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
