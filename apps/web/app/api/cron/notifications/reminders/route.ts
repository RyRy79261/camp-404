import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isValidCronAuth(req.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json({ ok: true, sent: 0 });
}

function isValidCronAuth(auth: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || auth === null) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
