import { NextResponse } from "next/server";
import { assertCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const deny = assertCron(req);
  if (deny) return deny;
  return NextResponse.json({ ok: true, processed: 0 });
}
