import { assertCron } from "@/lib/cron-auth";
import { cronStubResponse } from "@/lib/cron-stub";

export const runtime = "nodejs";

/**
 * Will generate camp manuals. Not built yet: it says so and does nothing.
 * Scheduled daily in vercel.json.
 */
export async function GET(req: Request) {
  const deny = assertCron(req);
  if (deny) return deny;
  return cronStubResponse("manuals/generate");
}
