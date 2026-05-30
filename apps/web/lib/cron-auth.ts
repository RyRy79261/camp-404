import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Constant-time check of a cron `Authorization` header against `CRON_SECRET`.
 *
 * Fails closed: if the secret is unset/empty, NO request is authorized. The
 * previous `auth !== \`Bearer ${process.env.CRON_SECRET}\`` compare accepted
 * the literal `Bearer undefined` when the secret was missing, and was not
 * constant-time. Length-guarded so `timingSafeEqual` never throws.
 */
export function isAuthorizedCron(
  authHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  if (!authHeader) return false;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Guard for `/api/cron/*` route handlers. Returns a 401 `NextResponse` when
 * the request is not an authorized cron call, or `null` when it is.
 *
 *     const deny = assertCron(req);
 *     if (deny) return deny;
 */
export function assertCron(req: Request): NextResponse | null {
  if (
    isAuthorizedCron(req.headers.get("authorization"), process.env.CRON_SECRET)
  ) {
    return null;
  }
  return new NextResponse("Unauthorized", { status: 401 });
}
